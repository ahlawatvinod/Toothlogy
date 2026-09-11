/**
 * TOOTHLOGY DASHBOARDS — numbers from what actually happened
 *
 * Every figure is computed from the records that are the source of truth —
 * appointments, leads, ledger charges, reviews, postings, tickets — plus the
 * first-party, pseudonymous view events. Nothing is estimated or projected;
 * a figure with no data is zero, and a rate with no denominator is null
 * (shown as "—"), never a made-up percentage.
 *
 * A practice sees its own numbers (tl.analytics.practice.read on it); platform
 * operators see platform-wide totals (tl.analytics.platform.read). Neither
 * shows any person's identity.
 */

import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { db } from '../db/client';
import { can, isAuthenticated, type Principal } from '../rbac';
import { approximateTotal } from '../globalization/exchange-rates';

export const PRACTICE = 'tl.analytics.practice.read';
export const PLATFORM = 'tl.analytics.platform.read';
export const WINDOWS = [7, 30, 90] as const;
export type WindowDays = (typeof WINDOWS)[number];
const DAY = 86_400_000;

export function windowDays(raw: unknown): WindowDays {
  const n = Number(raw);
  return n === 7 || n === 90 ? n : 30;
}

const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

/** One row per day of the window (India time), zero where nothing happened. */
export function fillDays(days: number, now: Date, rows: ReadonlyArray<{ day: string; n: bigint | number }>): Array<{ day: string; count: number }> {
  const byDay = new Map(rows.map((r) => [r.day, Number(r.n)]));
  const out: Array<{ day: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = dayKey(new Date(now.getTime() - i * DAY));
    out.push({ day, count: byDay.get(day) ?? 0 });
  }
  return out;
}

const rate = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : null);
const minor = (value: bigint | null | undefined) => Number(value ?? 0n);

function perDay(table: 'appointments' | 'users', column: 'createdAt', since: Date, organizationId?: string, dentistProfileId?: string) {
  const local = Prisma.sql`to_char((${Prisma.raw(`"${column}"`)} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;
  const scope = organizationId
    ? Prisma.sql`AND "organizationId" = ${organizationId}`
    : dentistProfileId
      ? Prisma.sql`AND "dentistProfileId" = ${dentistProfileId}`
      : Prisma.empty;
  return db().$queryRaw<Array<{ day: string; n: bigint }>>(Prisma.sql`SELECT ${local} AS day, count(*)::bigint AS n FROM ${Prisma.raw(`"${table}"`)} WHERE ${Prisma.raw(`"${column}"`)} >= ${since} ${scope} GROUP BY 1`);
}

// ---------------------------------------------------------------------------
// A practice
// ---------------------------------------------------------------------------

export async function practiceAnalytics(principal: Principal, organizationId: string, days: WindowDays = 30, now: Date = new Date()) {
  if (!isAuthenticated(principal) || !can(principal, PRACTICE, { organizationId })) throw errors.notFound('Organization');
  const organization = await db().organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true, name: true, currency: true } });
  if (!organization) throw errors.notFound('Organization');
  const since = new Date(now.getTime() - days * DAY);
  const dentistIds = (await db().dentistPractice.findMany({ where: { location: { organizationId } }, select: { dentistProfileId: true }, distinct: ['dentistProfileId'] })).map((d) => d.dentistProfileId);
  const leadWhere = { organizationId, createdAt: { gte: since } };

  const [booked, outcomes, leadsCreated, leadsQualified, leadsBooked, leadsConverted, billing, reviewsWindow, reviewsAll, spend, services, byDay, views, wallet] = await Promise.all([
    db().appointment.count({ where: { organizationId, createdAt: { gte: since } } }),
    db().appointment.groupBy({ by: ['status'], where: { organizationId, startsAt: { gte: since, lte: now } }, _count: { _all: true } }),
    db().lead.count({ where: leadWhere }),
    db().lead.count({ where: { ...leadWhere, qualifiedAt: { not: null } } }),
    db().lead.count({ where: { ...leadWhere, appointmentId: { not: null } } }),
    db().lead.count({ where: { ...leadWhere, status: { in: ['COMPLETED', 'CONVERTED'] } } }),
    db().lead.groupBy({ by: ['billingStatus'], where: leadWhere, _count: { _all: true } }),
    db().review.aggregate({ where: { organizationId, status: 'PUBLISHED', createdAt: { gte: since } }, _count: { _all: true }, _avg: { rating: true } }),
    db().review.aggregate({ where: { organizationId, status: 'PUBLISHED' }, _count: { _all: true }, _avg: { rating: true } }),
    db().ledgerEntry.aggregate({ where: { wallet: { organizationId }, kind: { in: ['LEAD_CHARGE', 'REFUND'] }, createdAt: { gte: since } }, _sum: { amountMinor: true } }),
    db().appointment.groupBy({ by: ['serviceName'], where: { organizationId, createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { serviceName: 'desc' } }, take: 5 }),
    perDay('appointments', 'createdAt', since, organizationId),
    db().analyticsEvent.groupBy({
      by: ['name'],
      where: {
        occurredAt: { gte: since },
        name: { in: ['profile_viewed', 'clinic_viewed'] },
        OR: [{ subjectType: 'organization', subjectId: organizationId }, ...(dentistIds.length ? [{ subjectType: 'dentist', subjectId: { in: dentistIds } }] : [])],
      },
      _count: { _all: true },
    }),
    db().wallet.findUnique({ where: { organizationId }, select: { currency: true } }),
  ]);

  const outcome = (status: string) => outcomes.find((o) => o.status === status)?._count._all ?? 0;
  const billed = (status: string) => billing.find((b) => b.billingStatus === status)?._count._all ?? 0;
  const completed = outcome('COMPLETED');
  const noShow = outcome('NO_SHOW');
  return {
    organization,
    days,
    since,
    appointments: { booked, completed, noShow, cancelled: outcome('CANCELLED'), declined: outcome('REJECTED'), expired: outcome('EXPIRED'), attendedRate: rate(completed, completed + noShow) },
    leads: { created: leadsCreated, qualified: leadsQualified, booked: leadsBooked, converted: leadsConverted, free: billed('FREE'), charged: billed('CHARGED'), refunded: billed('REFUNDED'), waitingForFunds: billed('PENDING_FUNDS') },
    /** Lead charges net of refunds in the window, in minor units (positive = spent). */
    // 0 − x, not −x: a practice with no charges spent 0, not −0.
    spendMinor: 0 - minor(spend._sum.amountMinor),
    /** The wallet's currency — never assumed; the organization's own before it has a wallet. */
    spendCurrency: wallet?.currency ?? organization.currency,
    reviews: { inWindow: reviewsWindow._count._all, averageInWindow: reviewsWindow._avg.rating, total: reviewsAll._count._all, average: reviewsAll._avg.rating },
    topServices: services.map((s) => ({ name: s.serviceName, count: s._count._all })),
    bookingsByDay: fillDays(days, now, byDay),
    views: { profile: views.find((v) => v.name === 'profile_viewed')?._count._all ?? 0, clinic: views.find((v) => v.name === 'clinic_viewed')?._count._all ?? 0 },
  };
}

// ---------------------------------------------------------------------------
// A dentist, across every practice
// ---------------------------------------------------------------------------

/**
 * The signed-in dentist's own numbers across the practices they work at:
 * bookings and outcomes, reviews, profile views, most-booked services. Lead
 * charges belong to the practice and are not shown here. 404 for anyone
 * without a dentist profile.
 */
export async function dentistAnalytics(principal: Principal, days: WindowDays = 30, now: Date = new Date()) {
  if (!isAuthenticated(principal)) throw errors.notFound('Dentist profile');
  const profile = await db().dentistProfile.findUnique({ where: { userId: principal.userId }, select: { id: true, slug: true } });
  if (!profile) throw errors.notFound('Dentist profile');
  const since = new Date(now.getTime() - days * DAY);
  const mine = { dentistProfileId: profile.id };

  const [booked, outcomes, reviewsWindow, reviewsAll, services, byDay, profileViews, practices] = await Promise.all([
    db().appointment.count({ where: { ...mine, createdAt: { gte: since } } }),
    db().appointment.groupBy({ by: ['status'], where: { ...mine, startsAt: { gte: since, lte: now } }, _count: { _all: true } }),
    db().review.aggregate({ where: { ...mine, status: 'PUBLISHED', createdAt: { gte: since } }, _count: { _all: true }, _avg: { rating: true } }),
    db().review.aggregate({ where: { ...mine, status: 'PUBLISHED' }, _count: { _all: true }, _avg: { rating: true } }),
    db().appointment.groupBy({ by: ['serviceName'], where: { ...mine, createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { serviceName: 'desc' } }, take: 5 }),
    perDay('appointments', 'createdAt', since, undefined, profile.id),
    db().analyticsEvent.count({ where: { occurredAt: { gte: since }, name: 'profile_viewed', subjectType: 'dentist', subjectId: profile.id } }),
    db().dentistPractice.count({ where: { ...mine, isConfirmed: true } }),
  ]);

  const outcome = (status: string) => outcomes.find((o) => o.status === status)?._count._all ?? 0;
  const completed = outcome('COMPLETED');
  const noShow = outcome('NO_SHOW');
  return {
    profile,
    days,
    since,
    practices,
    appointments: { booked, completed, noShow, cancelled: outcome('CANCELLED'), attendedRate: rate(completed, completed + noShow) },
    reviews: { inWindow: reviewsWindow._count._all, averageInWindow: reviewsWindow._avg.rating, total: reviewsAll._count._all, average: reviewsAll._avg.rating },
    topServices: services.map((s) => ({ name: s.serviceName, count: s._count._all })),
    bookingsByDay: fillDays(days, now, byDay),
    profileViews,
  };
}

// ---------------------------------------------------------------------------
// The platform
// ---------------------------------------------------------------------------

export async function platformAnalytics(principal: Principal, days: WindowDays = 30, now: Date = new Date()) {
  if (!isAuthenticated(principal) || !can(principal, PLATFORM)) throw errors.forbidden(PLATFORM);
  const since = new Date(now.getTime() - days * DAY);
  const [
    usersTotal,
    usersNew,
    dentistsVerified,
    dentistsVerifiedNew,
    organizationsVerified,
    appointmentsBooked,
    appointmentsCompleted,
    leadsCreated,
    leadsCharged,
    revenue,
    reviews,
    articlesPublished,
    postingsOpen,
    applicationsNew,
    ticketsOpen,
    ticketsNew,
    recordShares,
    searches,
    signupsByDay,
    bookingsByDay,
  ] = await Promise.all([
    db().user.count({ where: { deletedAt: null } }),
    db().user.count({ where: { deletedAt: null, createdAt: { gte: since } } }),
    db().dentistProfile.count({ where: { isVerified: true, deletedAt: null } }),
    db().dentistProfile.count({ where: { isVerified: true, deletedAt: null, verifiedAt: { gte: since } } }),
    db().organization.count({ where: { deletedAt: null, verifiedAt: { not: null } } }),
    db().appointment.count({ where: { createdAt: { gte: since } } }),
    db().appointment.count({ where: { status: 'COMPLETED', completedAt: { gte: since } } }),
    db().lead.count({ where: { createdAt: { gte: since } } }),
    db().lead.count({ where: { billingStatus: 'CHARGED', createdAt: { gte: since } } }),
    // Per currency: amounts in different currencies are never added together,
    // and no exchange rate is invented to do it.
    db().ledgerEntry.groupBy({ by: ['currency'], where: { kind: { in: ['LEAD_CHARGE', 'REFUND'] }, createdAt: { gte: since } }, _sum: { amountMinor: true } }),
    db().review.aggregate({ where: { status: 'PUBLISHED', createdAt: { gte: since } }, _count: { _all: true }, _avg: { rating: true } }),
    db().article.count({ where: { publishedAt: { gte: since } } }),
    db().jobPosting.count({ where: { status: 'OPEN', OR: [{ closesAt: null }, { closesAt: { gt: now } }] } }),
    db().jobApplication.count({ where: { createdAt: { gte: since } } }),
    db().supportTicket.count({ where: { status: { in: ['OPEN', 'WAITING_ON_USER'] } } }),
    db().supportTicket.count({ where: { createdAt: { gte: since } } }),
    db().recordAccessGrant.count({ where: { status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    db().analyticsEvent.count({ where: { name: 'search_performed', occurredAt: { gte: since } } }),
    perDay('users', 'createdAt', since),
    perDay('appointments', 'createdAt', since),
  ]);
  const byCurrency = revenue.map((r) => ({ currency: r.currency, minor: 0 - minor(r._sum.amountMinor) })).sort((a, b) => b.minor - a.minor);
  // Across currencies only as a labelled approximation at recorded rates,
  // in the largest currency — never a conversion, and not shown when a rate is missing.
  const approximate = byCurrency.length > 1 ? await approximateTotal(byCurrency, byCurrency[0]!.currency, now) : null;
  return {
    days,
    since,
    people: { total: usersTotal, new: usersNew },
    trust: { dentistsVerified, dentistsVerifiedNew, organizationsVerified },
    care: { appointmentsBooked, appointmentsCompleted, searches, recordShares },
    revenue: {
      leadsCreated,
      leadsCharged,
      /** Lead charges less refunds, one figure per currency, largest first. */
      byCurrency,
      /** Only when more than one currency: an approximate total at staff-recorded rates. */
      approximate,
    },
    community: { reviews: reviews._count._all, averageRating: reviews._avg.rating, articlesPublished, postingsOpen, applicationsNew },
    support: { open: ticketsOpen, new: ticketsNew },
    signupsByDay: fillDays(days, now, signupsByDay),
    bookingsByDay: fillDays(days, now, bookingsByDay),
  };
}
