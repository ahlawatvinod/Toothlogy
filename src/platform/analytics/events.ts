/**
 * TOOTHLOGY PRODUCT ANALYTICS
 *
 * First-party, privacy-preserving event recording — the numbers behind a
 * dentist's "profile views this month" and the booking funnel.
 *
 * WHAT IS NEVER RECORDED
 * - who the person is: the actor is a keyed hash (HMAC), so events can be
 *   counted per distinct person but never joined back to an account;
 * - contact details or clinical detail: properties pass through
 *   `sanitizeProperties`, which drops them by key pattern;
 * - anything for someone who has not consented to analytics — enforced by the
 *   caller passing `actor: null`, which records the event anonymously.
 *
 * Recording never throws and never slows the request: a lost analytics event
 * costs a number on a chart; a failed page costs a patient.
 */

import { hasDatabase } from '../config';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { logger } from '../observability/logger';
import { hasEncryptionKey, sign } from '../security/crypto';
import { analyticsProvider, sanitizeProperties, type AnalyticsValue } from './ports';

export const ANALYTICS_EVENTS = [
  'search_performed',
  'search_result_clicked',
  'profile_viewed',
  'clinic_viewed',
  'service_viewed',
  'contact_clicked',
  'directions_clicked',
  'booking_started',
  'booking_completed',
  'booking_abandoned',
  'appointment_cancelled',
  'appointment_no_show',
  'rebooking_started',
  'review_submitted',
  'lead_created',
  'lead_accepted',
  'lead_converted',
  'sponsored_impression',
  'sponsored_click',
  'marketplace_viewed',
  'marketplace_ordered',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export interface TrackInput {
  readonly subjectType?: string;
  readonly subjectId?: string;
  /** A user id or an anonymous visitor id. Hashed before storage. Null: anonymous. */
  readonly actor?: string | null;
  readonly properties?: Readonly<Record<string, AnalyticsValue>>;
}

function actorKey(actor: string | null | undefined): string | null {
  if (!actor || !hasEncryptionKey()) return null;
  return sign(actor, 'analytics-actor').slice(0, 32);
}

export async function trackEvent(name: AnalyticsEventName, input: TrackInput = {}): Promise<void> {
  if (!hasDatabase()) return;
  try {
    const properties = input.properties ? sanitizeProperties(input.properties) : undefined;
    const key = actorKey(input.actor);

    await db().analyticsEvent.create({
      data: {
        id: newId('analyticsEvent'),
        name,
        subjectType: input.subjectType ?? null,
        subjectId: input.subjectId ?? null,
        actorKey: key,
        properties: properties && Object.keys(properties).length > 0 ? (properties as never) : undefined,
      },
    });

    // Forwarded to an external analytics tool only when one is configured,
    // and only in the same sanitised, pseudonymous form.
    if (analyticsProvider.isConfigured()) {
      void analyticsProvider
        .get()
        .track({
          name,
          // The same keyed hash stored locally — never a user id or contact detail.
          distinctId: key ?? 'anonymous',
          properties: { ...(properties ?? {}), ...(input.subjectType ? { subjectType: input.subjectType } : {}) },
          timestamp: new Date(),
        })
        .catch(() => {});
    }
  } catch (error) {
    logger.warn('Analytics event not recorded', { name, error });
  }
}

/**
 * Who to record for a signed-in viewer: themselves (as a keyed hash) only if
 * they agreed to analytics; otherwise nobody — the event is anonymous.
 */
export async function consentedActor(userId: string | null): Promise<string | null> {
  if (!userId || !hasDatabase()) return null;
  try {
    const consent = await db().consent.findFirst({ where: { userId, purpose: 'ANALYTICS_TRACKING', revokedAt: null }, select: { id: true } });
    return consent ? userId : null;
  } catch {
    return null;
  }
}

/** Record a view or search from a page, honouring analytics consent. Never throws. */
export async function trackView(
  name: 'profile_viewed' | 'clinic_viewed' | 'search_performed',
  subjectType: string,
  subjectId: string,
  viewerUserId: string | null,
  properties?: Readonly<Record<string, AnalyticsValue>>,
): Promise<void> {
  try {
    await trackEvent(name, { subjectType, subjectId, actor: await consentedActor(viewerUserId), properties });
  } catch {
    // trackEvent never throws; this guards the consent lookup too.
  }
}

/** Events and distinct people for one subject over a window. */
export async function subjectCounts(
  subjectType: string,
  subjectId: string,
  names: readonly AnalyticsEventName[],
  since: Date,
): Promise<Record<string, { events: number; people: number }>> {
  const rows = await db().analyticsEvent.groupBy({
    by: ['name'],
    where: { subjectType, subjectId, name: { in: [...names] }, occurredAt: { gte: since } },
    _count: { _all: true },
  });

  const distinct = await db().$queryRaw<Array<{ name: string; people: bigint }>>`
    SELECT "name", count(DISTINCT "actorKey") AS "people"
    FROM "analytics_events"
    WHERE "subjectType" = ${subjectType} AND "subjectId" = ${subjectId}
      AND "occurredAt" >= ${since} AND "actorKey" IS NOT NULL
    GROUP BY "name"
  `;

  const out: Record<string, { events: number; people: number }> = {};
  for (const name of names) {
    out[name] = {
      events: rows.find((r) => r.name === name)?._count._all ?? 0,
      people: Number(distinct.find((d) => d.name === name)?.people ?? 0),
    };
  }
  return out;
}

/** A dentist's own dashboard numbers for the last `days` days. */
export async function dentistAnalytics(dentistProfileId: string, days = 30) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const counts = await subjectCounts(
    'dentist',
    dentistProfileId,
    ['profile_viewed', 'search_result_clicked', 'contact_clicked', 'directions_clicked', 'booking_started', 'booking_completed'],
    since,
  );
  return { days, since, counts };
}
