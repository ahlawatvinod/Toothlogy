/**
 * TOOTHLOGY USER PREFERENCES, PROFILE, CONSENT AND SAVED PLACES
 *
 * Everything a person controls about how Toothlogy treats them, other than
 * credentials (auth/) and clinical data (records, Phase 6).
 *
 * Every value is validated against the registry: a locale must be an enabled
 * language, a timezone a real IANA zone, a currency a registered one. A
 * preference the rest of the platform cannot honour is worse than none — the
 * user believes they changed something that silently does nothing.
 */

import { z } from 'zod';
import { NOTIFICATIONS } from '@/registry/events';
import {
  COUNTRY_BY_CODE,
  CURRENCY_BY_CODE,
  LANGUAGE_BY_CODE,
} from '@/registry/globalization';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from '@/registry/types';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { sign, verifySignature } from '../security/crypto';

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const minutes = z.number().int().min(0).max(1439);

export const preferencesSchema = z
  .object({
    locale: z.string().refine((c) => LANGUAGE_BY_CODE.get(c)?.enabled === true, 'That language is not available yet.').optional(),
    timezone: z.string().refine(isTimeZone, 'Choose a valid timezone.').optional(),
    countryCode: z.string().length(2).toUpperCase().refine((c) => COUNTRY_BY_CODE.has(c), 'That country is not supported yet.').optional(),
    currency: z
      .string()
      .length(3)
      .toUpperCase()
      .refine((c) => CURRENCY_BY_CODE.has(c), 'That currency is not supported.')
      .nullable()
      .optional(),
    theme: z.enum(['SYSTEM', 'LIGHT', 'DARK']).optional(),
    palette: z.enum(['teal', 'indigo', 'rose', 'amber', 'slate']).optional(),
    reducedMotion: z.boolean().optional(),
    highContrast: z.boolean().optional(),
    textScale: z.number().int().min(90).max(150).optional(),
    quietHours: z.object({ start: minutes, end: minutes }).nullable().optional(),
    distanceUnit: z.enum(['KM', 'MI']).optional(),
    defaultSearchRadiusKm: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export type PreferencesInput = z.infer<typeof preferencesSchema>;

export async function getPreferences(userId: string) {
  const user = await db().user.findUnique({ where: { id: userId }, include: { preference: true } });
  if (!user) throw errors.notFound('Account');
  const p = user.preference;
  return {
    locale: user.locale ?? 'en',
    timezone: user.timezone ?? 'Asia/Kolkata',
    countryCode: user.countryCode ?? 'IN',
    currency: p?.currency ?? null,
    theme: p?.theme ?? 'SYSTEM',
    palette: p?.palette ?? 'teal',
    reducedMotion: p?.reducedMotion ?? false,
    highContrast: p?.highContrast ?? false,
    textScale: p?.textScale ?? 100,
    quietHours:
      p?.quietHoursStart !== null && p?.quietHoursStart !== undefined && p.quietHoursEnd !== null
        ? { start: p.quietHoursStart, end: p.quietHoursEnd }
        : null,
    distanceUnit: p?.distanceUnit ?? 'KM',
    defaultSearchRadiusKm: p?.defaultSearchRadiusKm ?? 10,
  };
}

export async function updatePreferences(
  userId: string,
  rawInput: PreferencesInput,
  context: { requestId?: string } = {},
) {
  const parsed = preferencesSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('Those preferences are not valid.', {
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
    });
  }
  const input = parsed.data;

  await transaction(async (tx) => {
    if (input.locale !== undefined || input.timezone !== undefined || input.countryCode !== undefined) {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.locale !== undefined ? { locale: input.locale } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
        },
      });
    }

    const prefData = {
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.theme !== undefined ? { theme: input.theme } : {}),
      ...(input.palette !== undefined ? { palette: input.palette } : {}),
      ...(input.reducedMotion !== undefined ? { reducedMotion: input.reducedMotion } : {}),
      ...(input.highContrast !== undefined ? { highContrast: input.highContrast } : {}),
      ...(input.textScale !== undefined ? { textScale: input.textScale } : {}),
      ...(input.quietHours !== undefined
        ? {
            quietHoursStart: input.quietHours?.start ?? null,
            quietHoursEnd: input.quietHours?.end ?? null,
          }
        : {}),
      ...(input.distanceUnit !== undefined ? { distanceUnit: input.distanceUnit } : {}),
      ...(input.defaultSearchRadiusKm !== undefined ? { defaultSearchRadiusKm: input.defaultSearchRadiusKm } : {}),
    };

    await tx.userPreference.upsert({
      where: { userId },
      create: { id: newId('userPreference'), userId, ...prefData },
      update: prefData,
    });
  });

  await recordAuditEvent({
    action: 'PREFERENCES_UPDATED',
    actor: userId,
    subject: userId,
    outcome: 'success',
    requestId: context.requestId,
    detail: { fields: Object.keys(input) },
  });

  return getPreferences(userId);
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

const CHANNEL_DB = { in_app: 'IN_APP', push: 'PUSH', email: 'EMAIL', sms: 'SMS', whatsapp: 'WHATSAPP' } as const;

/**
 * Category × channel matrix. `locked` marks combinations the user cannot turn
 * off because every notification in that category is transactional — a
 * switch that looks like it works and does not would be a lie. They are shown
 * as always-on, with the reason.
 */
export async function getNotificationPreferences(userId: string) {
  const rows = await db().notificationPreference.findMany({ where: { userId } });

  return NOTIFICATION_CATEGORIES.map((category) => {
    const definitions = NOTIFICATIONS.filter((n) => n.category === category);
    const channelsUsed = new Set(definitions.flatMap((d) => d.channels));
    const allTransactional = definitions.length > 0 && definitions.every((d) => d.transactional);

    return {
      category,
      notificationCount: definitions.length,
      channels: NOTIFICATION_CHANNELS.map((channel) => {
        const dbChannel = CHANNEL_DB[channel];
        const specific = rows.find((r) => r.channel === dbChannel && r.category === category.toUpperCase());
        const channelWide = rows.find((r) => r.channel === dbChannel && r.category === 'ALL');
        return {
          channel,
          used: channelsUsed.has(channel),
          enabled: specific?.enabled ?? channelWide?.enabled ?? true,
          locked: allTransactional,
        };
      }),
    };
  });
}

export const notificationPreferenceSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  category: z.enum([...NOTIFICATION_CATEGORIES, 'all'] as [string, ...string[]]),
  enabled: z.boolean(),
});

export async function setNotificationPreference(
  userId: string,
  input: z.infer<typeof notificationPreferenceSchema>,
): Promise<void> {
  const channel = CHANNEL_DB[input.channel as keyof typeof CHANNEL_DB];
  const category = input.category.toUpperCase() as 'ALL';
  await db().notificationPreference.upsert({
    where: { userId_channel_category: { userId, channel, category } },
    create: { id: newId('notificationPreference'), userId, channel, category, enabled: input.enabled },
    update: { enabled: input.enabled },
  });
}

// ---------------------------------------------------------------------------
// Unsubscribe links
// ---------------------------------------------------------------------------

/** Categories a one-click link may turn off. Transactional mail has no such link. */
const UNSUBSCRIBABLE = new Set(['marketing', 'community']);

export function unsubscribeLink(userId: string, category: string, channel: string): string {
  const payload = `${userId}:${category}:${channel}`;
  const params = new URLSearchParams({ u: userId, c: category, ch: channel, s: sign(payload, 'unsubscribe') });
  return `/api/v1/notifications/unsubscribe?${params.toString()}`;
}

export async function unsubscribeFromLink(params: {
  u: string;
  c: string;
  ch: string;
  s: string;
}): Promise<{ category: string; channel: string }> {
  if (!verifySignature(`${params.u}:${params.c}:${params.ch}`, params.s, 'unsubscribe')) {
    throw errors.validation('This unsubscribe link is not valid.');
  }
  if (!UNSUBSCRIBABLE.has(params.c) || !(params.ch in CHANNEL_DB)) {
    throw errors.validation('This kind of message cannot be unsubscribed from by link. Change it in your settings.');
  }
  await setNotificationPreference(params.u, {
    channel: params.ch as keyof typeof CHANNEL_DB,
    category: params.c,
    enabled: false,
  });
  await recordAuditEvent({
    action: 'NOTIFICATION_UNSUBSCRIBED',
    actor: params.u,
    subject: params.u,
    outcome: 'success',
    detail: { category: params.c, channel: params.ch },
  });
  return { category: params.c, channel: params.ch };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const profileSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Enter your name.').max(120).optional(),
    /** A FileObject id of the caller's own ACTIVE AVATAR upload, or null to remove. */
    avatarFileId: z.string().max(64).nullable().optional(),
  })
  .strict();

export async function updateProfile(
  userId: string,
  input: z.infer<typeof profileSchema>,
  context: { requestId?: string } = {},
) {
  if (input.avatarFileId) {
    const file = await db().fileObject.findFirst({
      where: { id: input.avatarFileId, ownerUserId: userId, purpose: 'AVATAR', status: 'ACTIVE' },
    });
    // Someone else's file id, or a document, cannot become a profile photo.
    if (!file) throw errors.validation('Upload the photo first, then choose it.', { field: 'avatarFileId' });
  }

  const user = await db().user.update({
    where: { id: userId },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.avatarFileId !== undefined ? { avatarFileId: input.avatarFileId } : {}),
    },
    select: { displayName: true, avatarFileId: true },
  });

  await recordAuditEvent({
    action: 'PROFILE_UPDATED',
    actor: userId,
    subject: userId,
    outcome: 'success',
    requestId: context.requestId,
  });
  return user;
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

export const CONSENT_PURPOSES = [
  'MARKETING_EMAIL',
  'MARKETING_SMS',
  'MARKETING_WHATSAPP',
  'ANALYTICS_TRACKING',
  'AI_TRAINING',
] as const;

/** Current state per purpose. Clinical data sharing is managed per grant (Phase 6). */
export async function listConsents(userId: string) {
  const rows = await db().consent.findMany({ where: { userId }, orderBy: { grantedAt: 'desc' } });
  return CONSENT_PURPOSES.map((purpose) => {
    const active = rows.find((r) => r.purpose === purpose && r.revokedAt === null);
    return { purpose, granted: Boolean(active), grantedAt: active?.grantedAt ?? null };
  });
}

/**
 * Grant or revoke. Append-only: a revocation sets `revokedAt` on the active
 * grant rather than deleting it, because proving consent was held at a given
 * time is the entire point of recording it.
 */
export async function setConsent(
  userId: string,
  purpose: (typeof CONSENT_PURPOSES)[number],
  granted: boolean,
  context: { ipAddress?: string | null; requestId?: string; policyVersion?: string } = {},
): Promise<void> {
  await transaction(async (tx) => {
    const active = await tx.consent.findFirst({ where: { userId, purpose, revokedAt: null } });
    if (granted && !active) {
      await tx.consent.create({
        data: {
          id: newId('consent'),
          userId,
          purpose,
          policyVersion: context.policyVersion ?? '2026-09',
          ipAddress: context.ipAddress ?? null,
        },
      });
    }
    if (!granted && active) {
      await tx.consent.update({ where: { id: active.id }, data: { revokedAt: new Date() } });
    }
  });

  await recordAuditEvent({
    action: granted ? 'CONSENT_GRANTED' : 'CONSENT_REVOKED',
    actor: userId,
    subject: userId,
    outcome: 'success',
    requestId: context.requestId,
    detail: { purpose },
  });
}

// ---------------------------------------------------------------------------
// Saved locations
// ---------------------------------------------------------------------------

export const savedLocationSchema = z.object({
  label: z.string().trim().min(1, 'Name this place, e.g. Home.').max(60),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isDefault: z.boolean().default(false),
});

export async function listSavedLocations(userId: string) {
  const rows = await db().savedLocation.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    isDefault: r.isDefault,
  }));
}

export async function addSavedLocation(userId: string, input: z.infer<typeof savedLocationSchema>) {
  const count = await db().savedLocation.count({ where: { userId } });
  if (count >= 10) throw errors.preconditionFailed('You can save up to 10 places. Remove one first.');

  const id = newId('location');
  await transaction(async (tx) => {
    if (input.isDefault || count === 0) {
      await tx.savedLocation.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    await tx.savedLocation.create({
      data: {
        id,
        userId,
        label: input.label,
        latitude: input.latitude,
        longitude: input.longitude,
        isDefault: input.isDefault || count === 0,
      },
    });
  });
  return { id };
}

export async function removeSavedLocation(userId: string, id: string): Promise<void> {
  // Scoped by userId: another user's saved place is simply not found.
  const result = await db().savedLocation.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw errors.notFound('Saved place');
}
