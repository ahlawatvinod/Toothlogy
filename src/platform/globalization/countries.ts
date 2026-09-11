/**
 * TOOTHLOGY COUNTRIES — opening a market is configuration (Constitution §4)
 *
 * Every country in the registry is modelled for everyone, but open for
 * onboarding only while its `enabled` switch is on. Toothlogy staff switch it
 * from the console — and switching on is refused until everything the
 * country needs is configured, so a market is never opened half-ready:
 * - its currency is modelled (minor units, symbol);
 * - its default language is modelled and switched on;
 * - its default time zone is a real IANA zone;
 * - its regions are loaded (addresses and districts hang off them);
 * - a standard lead price, with a current tax rate, is configured — without
 *   it no lead there could be billed.
 * Switching a country off stops new organizations there; existing ones
 * carry on. Both are audited with a reason.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { can, isAuthenticated, type Principal } from '../rbac';
import { formatMoney } from '../money';
import { standardLeadPricing } from '../billing/service';
import { CURRENCY_BY_CODE, LANGUAGE_BY_CODE } from '@/registry/globalization';
import type { TaxRegime } from '@prisma/client';
import { taxPackFor } from '../tax/packs';

export const MANAGE = 'tl.admin.country.manage';

export interface ReadinessCheck {
  readonly key: 'currency' | 'language' | 'timezone' | 'regions' | 'pricing' | 'tax';
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

function validTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** What a country needs before it may open, each with what was found. */
export async function countryReadiness(country: { code: string; defaultCurrency: string; defaultLocale: string; defaultTimezone: string; taxRegime: TaxRegime }): Promise<ReadinessCheck[]> {
  const pack = taxPackFor(country.taxRegime);
  const currency = CURRENCY_BY_CODE.get(country.defaultCurrency);
  const language = LANGUAGE_BY_CODE.get(country.defaultLocale) ?? LANGUAGE_BY_CODE.get(country.defaultLocale.split('-')[0]!);
  const [regions, pricing] = await Promise.all([db().region.count({ where: { countryCode: country.code } }), standardLeadPricing(country.code).catch(() => null)]);
  return [
    { key: 'currency', label: 'Currency modelled', ok: Boolean(currency), detail: currency ? `${currency.code}, ${currency.minorUnits} decimal places` : `${country.defaultCurrency} is not in the currency registry` },
    {
      key: 'language',
      label: 'Language switched on',
      ok: Boolean(language?.enabled),
      detail: !language ? `${country.defaultLocale} is not in the language registry` : language.enabled ? language.name : `${language.name} is modelled; its translations are not switched on`,
    },
    { key: 'timezone', label: 'Time zone valid', ok: validTimezone(country.defaultTimezone), detail: country.defaultTimezone },
    { key: 'regions', label: 'Regions loaded', ok: regions > 0, detail: regions > 0 ? `${regions} regions` : 'No regions loaded' },
    {
      key: 'pricing',
      label: 'Lead price and tax configured',
      ok: Boolean(pricing),
      detail: pricing ? `${pricing.freeLeadAllowance} free, then ${formatMoney({ amountMinor: pricing.grossMinor, currency: pricing.currency }, 'en-IN')} each including tax` : 'No standard lead price with a current tax rate',
    },
    {
      key: 'tax',
      label: 'Tax pack for invoices',
      // Every modelled regime has a pack; this states which one a market's
      // sellers will issue tax documents under.
      ok: true,
      detail: `${country.taxRegime}: ${pack.documentTitle('INVOICE').toLowerCase()}${pack.taxIdentifierLabel ? `, ${pack.taxIdentifierLabel}` : ''}${pack.taxCodeLabel ? `, ${pack.taxCodeLabel} codes` : ''}; fiscal year ${pack.fiscalYear(new Date())}`,
    },
  ];
}

export async function listCountries(principal: Principal) {
  if (!isAuthenticated(principal) || !can(principal, MANAGE)) throw errors.forbidden(MANAGE);
  const [countries, organizations] = await Promise.all([
    db().country.findMany({ orderBy: [{ enabled: 'desc' }, { name: 'asc' }] }),
    db().organization.groupBy({ by: ['countryCode'], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  const count = new Map(organizations.map((o) => [o.countryCode, o._count._all]));
  return Promise.all(
    countries.map(async (c) => {
      const checks = await countryReadiness(c);
      return { code: c.code, name: c.name, enabled: c.enabled, currency: c.defaultCurrency, locale: c.defaultLocale, timezone: c.defaultTimezone, organizations: count.get(c.code) ?? 0, checks, ready: checks.every((x) => x.ok) };
    }),
  );
}

export const switchSchema = z.object({ enabled: z.boolean(), reason: z.string().trim().min(5, 'Say why, in a few words.').max(300) });

export async function setCountryEnabled(principal: Principal, code: string, raw: z.input<typeof switchSchema>, context: { requestId?: string } = {}) {
  if (!isAuthenticated(principal) || !can(principal, MANAGE)) throw errors.forbidden(MANAGE);
  const parsed = switchSchema.safeParse(raw);
  if (!parsed.success) throw errors.validation(parsed.error.issues[0]!.message, { field: String(parsed.error.issues[0]!.path[0] ?? 'reason') });
  const input = parsed.data;
  const country = await db().country.findUnique({ where: { code: code.toUpperCase() } });
  if (!country) throw errors.notFound('Country');
  if (input.enabled) {
    const missing = (await countryReadiness(country)).filter((c) => !c.ok);
    if (missing.length > 0) throw errors.preconditionFailed(`${country.name} is not ready: ${missing.map((m) => m.label.toLowerCase()).join(', ')}.`);
  }
  const moved = await db().country.updateMany({ where: { code: country.code, enabled: !input.enabled }, data: { enabled: input.enabled } });
  if (moved.count === 0) throw errors.conflict(input.enabled ? `${country.name} is already open.` : `${country.name} is already closed.`);
  await recordAuditEvent({ action: input.enabled ? 'COUNTRY_OPENED' : 'COUNTRY_CLOSED', actor: principal.userId, subject: `country:${country.code}`, outcome: 'success', requestId: context.requestId, detail: { reason: input.reason } });
  return { code: country.code, enabled: input.enabled };
}

/** Whether new organizations may be created in a country — the database switch, not the registry seed. */
export async function isCountryOpen(code: string): Promise<boolean> {
  const country = await db().country.findUnique({ where: { code: code.toUpperCase() }, select: { enabled: true } });
  return Boolean(country?.enabled);
}
