/**
 * TL-PAGE-ADMIN-COUNTRIES-001 — /admin/countries
 *
 * Opening a market is configuration: every modelled country with its
 * readiness checks — currency, language, time zone, regions, lead price and
 * tax — and the switch that opens it (only when all pass) or closes it to new
 * organizations. 404 without tl.admin.country.manage.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { listCountries, MANAGE } from '@/platform/globalization/countries';
import { Badge, Card, CardBody, CardHeader } from '@/design-system';
import { CountrySwitch } from '@/components/admin/country-switch';

export const metadata: Metadata = { title: 'Countries (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function CountriesPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/countries');
  if (!can(principal, MANAGE)) notFound();
  const countries = await listCountries(principal);

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '60rem' }}>
      <header className="tl-page__header">
        <h1>Countries (staff)</h1>
        <p className="tl-page__lead">A country opens for new organizations only when everything it needs is configured. Closing one stops new organizations there; existing ones carry on.</p>
      </header>
      {countries.map((c) => (
        <Card key={c.code} label={c.name}>
          <CardHeader>
            <div className="tl-card__title-row">
              <strong>
                {c.name} ({c.code})
              </strong>
              {c.enabled ? <Badge tone="success">open</Badge> : <Badge tone="neutral">closed</Badge>}
              {!c.enabled && c.ready ? <Badge tone="info">ready</Badge> : null}
            </div>
          </CardHeader>
          <CardBody>
            <div className="tl-stack">
              <span className="tl-list__meta">
                {c.currency} · {c.locale} · {c.timezone} · {c.organizations} organizations
              </span>
              <ul className="tl-list" aria-label={`Readiness of ${c.name}`}>
                {c.checks.map((check) => (
                  <li key={check.key}>
                    <span aria-hidden="true">{check.ok ? '✓' : '✗'}</span> <strong>{check.label}</strong>
                    <span className="tl-visually-hidden">{check.ok ? ' — done' : ' — missing'}</span>
                    <span className="tl-list__meta"> · {check.detail}</span>
                  </li>
                ))}
              </ul>
              <CountrySwitch code={c.code} name={c.name} enabled={c.enabled} ready={c.ready} />
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
