/**
 * TOOTHLOGY SPONSORED PLACEMENT — serving and attribution
 *
 * Sponsored slots are chosen here and only here, from running campaigns, and
 * returned separately from organic search results. Organic ranking (the
 * search provider) never sees a campaign, so paying cannot move anyone up the
 * organic list (Constitution P3).
 *
 * A campaign is shown only when all of these hold now: ACTIVE, within its
 * dates, budget not used up; the promoted dentist or clinic is still
 * eligible (verified, confirmed, not paused); its targeting matches the
 * search (treatment, appointment type, distance); and it has a genuinely
 * free time for the requested appointment type. One slot per promoted thing;
 * the highest daily budget first, then the earliest start.
 *
 * Impressions, clicks, profile views and booking clicks are recorded for
 * analytics, each click once per impression. Anything the promoted
 * organization's own members do is recorded as excluded.
 */

import { Prisma } from '@prisma/client';
import { db } from '../db/client';
import { newId } from '../kernel/ids';
import { distanceMetres } from '../location';
import { nextAvailableSlot } from '../appointments/availability';
import { CAMPAIGN_GEOFENCE_OWNER, placementSettings, primeTier } from './service';

type AppointmentKind = 'CLINIC' | 'VIDEO' | 'HOME_VISIT';
/** How long a click keeps earning attribution for a booking. */
const ATTRIBUTION_DAYS = 30;
/** A click on an impression older than this is not counted. */
const IMPRESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface SponsoredSlot {
  readonly campaignId: string;
  readonly impressionId: string;
  readonly label: 'Sponsored';
  readonly tier: string;
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
  readonly next: { localDate: string; localTime: string } | null;
  readonly excluded: boolean;
}

const CANDIDATE_INCLUDE = {
  organization: { select: { id: true, name: true, slug: true, type: true, status: true, deletedAt: true, verifiedAt: true, verificationExpires: true, countryCode: true } },
  practice: {
    select: {
      id: true,
      isConfirmed: true,
      bookingPaused: true,
      dentistProfile: { select: { userId: true, slug: true, isDiscoverable: true, deletedAt: true, headline: true, user: { select: { displayName: true } } } },
      location: { select: { name: true, status: true, deletedAt: true, latitude: true, longitude: true, organizationId: true } },
    },
  },
} satisfies Prisma.SponsoredCampaignInclude;
type Candidate = Prisma.SponsoredCampaignGetPayload<{ include: typeof CANDIDATE_INCLUDE }>;

function eligible(c: Candidate, now: Date): boolean {
  if (c.spentMinor + c.refundedMinor >= c.heldMinor) return false;
  const org = c.organization;
  if (org.deletedAt || !['ACTIVE', 'PENDING'].includes(org.status)) return false;
  if (c.subjectType === 'PRACTICE') {
    const p = c.practice;
    return Boolean(p && p.isConfirmed && !p.bookingPaused && p.dentistProfile.isDiscoverable && !p.dentistProfile.deletedAt && !p.location.deletedAt && p.location.status === 'ACTIVE' && p.location.organizationId === c.organizationId);
  }
  return org.verifiedAt !== null && (org.verificationExpires === null || org.verificationExpires > now);
}

/** The next free time of the promoted thing, or null if nothing is bookable. */
async function availability(c: Candidate, type: AppointmentKind) {
  if (c.subjectType === 'PRACTICE') return c.practiceId ? nextAvailableSlot(c.practiceId, type).catch(() => null) : null;
  const practices = await db().dentistPractice.findMany({
    where: { isConfirmed: true, bookingPaused: false, location: { organizationId: c.organizationId, deletedAt: null, status: 'ACTIVE' }, dentistProfile: { isDiscoverable: true, deletedAt: null } },
    select: { id: true },
    take: 20,
  });
  for (const p of practices) {
    const slot = await nextAvailableSlot(p.id, type).catch(() => null);
    if (slot) return slot;
  }
  return null;
}

async function viewerIsInternal(c: Candidate, viewerUserId: string | null | undefined): Promise<boolean> {
  if (!viewerUserId) return false;
  if (c.practice?.dentistProfile.userId === viewerUserId) return true;
  return (await db().organizationMember.count({ where: { organizationId: c.organizationId, userId: viewerUserId, leftAt: null } })) > 0;
}

interface ServeRequest {
  readonly placement: 'SEARCH' | 'PROFILE';
  readonly subjectTypes: ReadonlyArray<'PRACTICE' | 'ORGANIZATION'>;
  /** Where the search (or the viewed profile's branch) is. */
  readonly point: { latitude: number; longitude: number } | null;
  readonly treatment: string | null;
  readonly appointmentType: AppointmentKind;
  readonly viewerUserId?: string | null;
  /** Never promote the thing already being looked at. */
  readonly excludePracticeIds?: readonly string[];
  readonly excludeOrganizationId?: string | null;
  readonly context?: Record<string, string>;
  readonly now?: Date;
}

async function serve(request: ServeRequest): Promise<SponsoredSlot[]> {
  const now = request.now ?? new Date();
  const candidates = await db().sponsoredCampaign.findMany({
    where: {
      status: 'ACTIVE',
      startsAt: { lte: now },
      endsAt: { gt: now },
      subjectType: { in: [...request.subjectTypes] },
      ...(request.placement === 'SEARCH' ? { searchPlacement: true } : { profilePlacement: true }),
    },
    include: CANDIDATE_INCLUDE,
    orderBy: [{ dailyRateMinor: 'desc' }, { startsAt: 'asc' }, { id: 'asc' }],
    take: 50,
  });
  if (candidates.length === 0) return [];

  const fences = await db().geofence.findMany({
    where: { ownerType: CAMPAIGN_GEOFENCE_OWNER, ownerId: { in: candidates.map((c) => c.id) }, purpose: 'CAMPAIGN', isActive: true },
  });
  const fenceFor = new Map(fences.map((f) => [f.ownerId, f]));
  const settings = await placementSettings(candidates[0]!.organization.countryCode).catch(() => null);
  if (!settings) return [];
  const slots = request.placement === 'SEARCH' ? settings.searchSlots : settings.profileSlots;

  const chosen: Array<{ c: Candidate; next: Awaited<ReturnType<typeof availability>> }> = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (chosen.length >= slots) break;
    const subjectKey = c.practiceId ?? `org:${c.organizationId}`;
    if (seen.has(subjectKey)) continue; // one slot per promoted thing
    if (c.practiceId && request.excludePracticeIds?.includes(c.practiceId)) continue;
    if (c.subjectType === 'ORGANIZATION' && c.organizationId === request.excludeOrganizationId) continue;
    if (!eligible(c, now)) continue;
    if (c.targetTreatmentKeys.length > 0 && (!request.treatment || !c.targetTreatmentKeys.includes(request.treatment))) continue;
    if (c.targetAppointmentTypes.length > 0 && !c.targetAppointmentTypes.includes(request.appointmentType)) continue;
    const fence = fenceFor.get(c.id);
    if (fence && fence.centreLatitude !== null && fence.centreLongitude !== null && fence.radiusMetres !== null) {
      if (!request.point) continue;
      const metres = distanceMetres({ latitude: Number(fence.centreLatitude), longitude: Number(fence.centreLongitude) }, request.point);
      if (metres > fence.radiusMetres) continue;
    }
    const next = await availability(c, request.appointmentType);
    if (!next) continue; // not bookable now: not shown
    seen.add(subjectKey);
    chosen.push({ c, next });
  }

  const shown: SponsoredSlot[] = [];
  for (const { c, next } of chosen) {
    const internal = await viewerIsInternal(c, request.viewerUserId);
    const impressionId = newId('adEvent');
    await db().sponsoredEvent.create({
      data: {
        id: impressionId,
        campaignId: c.id,
        kind: 'IMPRESSION',
        placement: request.placement,
        viewerUserId: request.viewerUserId ?? null,
        excluded: internal,
        excludedReason: internal ? 'SELF' : null,
        context: { ...request.context, appointmentType: request.appointmentType },
      },
    });
    const title = c.subjectType === 'PRACTICE' ? (c.practice?.dentistProfile.user.displayName ?? 'Dentist') : c.organization.name;
    const subtitle =
      c.subjectType === 'PRACTICE' ? [c.practice?.dentistProfile.headline, `${c.organization.name}, ${c.practice?.location.name}`].filter(Boolean).join(' · ') : c.organization.name;
    shown.push({
      campaignId: c.id,
      impressionId,
      label: 'Sponsored',
      tier: primeTier(c.subjectType, c.organization.type),
      title,
      subtitle,
      href: `/api/v1/sponsored/click/${impressionId}`,
      next: next ? { localDate: next.localDate, localTime: next.localTime } : null,
      excluded: internal,
    });
  }
  return shown;
}

/** Sponsored slots for a search page. Empty when no valid campaign matches. */
export function sponsoredForSearch(request: {
  type: 'dentist' | 'clinic';
  point: { latitude: number; longitude: number } | null;
  treatment: string | null;
  appointmentType: AppointmentKind;
  viewerUserId?: string | null;
  now?: Date;
}) {
  return serve({
    placement: 'SEARCH',
    subjectTypes: request.type === 'dentist' ? ['PRACTICE'] : ['ORGANIZATION'],
    point: request.point,
    treatment: request.treatment,
    appointmentType: request.appointmentType,
    viewerUserId: request.viewerUserId,
    context: { surface: 'find', type: request.type },
    now: request.now,
  });
}

/** Sponsored slots on a dentist or clinic profile, for others near that branch. */
export function sponsoredForProfile(request: {
  point: { latitude: number; longitude: number } | null;
  excludePracticeIds?: readonly string[];
  excludeOrganizationId?: string | null;
  viewerUserId?: string | null;
  now?: Date;
}) {
  return serve({
    placement: 'PROFILE',
    subjectTypes: ['PRACTICE', 'ORGANIZATION'],
    point: request.point,
    treatment: null,
    appointmentType: 'CLINIC',
    viewerUserId: request.viewerUserId,
    excludePracticeIds: request.excludePracticeIds,
    excludeOrganizationId: request.excludeOrganizationId,
    context: { surface: 'profile' },
    now: request.now,
  });
}

// ---------------------------------------------------------------------------
// Clicks and follow-ups
// ---------------------------------------------------------------------------

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Record a click on an impression — once — and say where to send the patient.
 * A repeated click, a click on a stale impression and a click by the promoted
 * organization's own people still navigate, but count once or not at all.
 */
export async function recordSponsoredClick(impressionId: string, viewerUserId: string | null, now: Date = new Date()): Promise<{ location: string; clickId: string | null }> {
  const impression = await db().sponsoredEvent.findUnique({
    where: { id: impressionId },
    include: { campaign: { include: CANDIDATE_INCLUDE } },
  });
  if (!impression || impression.kind !== 'IMPRESSION') return { location: '/find', clickId: null };
  const c = impression.campaign;
  const target = c.subjectType === 'PRACTICE' ? `/dentists/${c.practice?.dentistProfile.slug}` : `/clinics/${c.organization.slug}`;
  const practiceParam = c.practiceId ? `&practice=${c.practiceId}` : '';

  const existing = await db().sponsoredEvent.findUnique({ where: { parentId_kind: { parentId: impressionId, kind: 'CLICK' } } });
  if (existing) return { location: `${target}?sp=${existing.id}${practiceParam}`, clickId: existing.id };

  const stale = now.getTime() - impression.createdAt.getTime() > IMPRESSION_TTL_MS;
  const internal = await viewerIsInternal(c, viewerUserId);
  const excludedReason = internal ? 'SELF' : stale ? 'STALE_IMPRESSION' : impression.excluded ? 'EXCLUDED_IMPRESSION' : null;
  const clickId = newId('adEvent');
  try {
    await db().sponsoredEvent.create({
      data: { id: clickId, campaignId: c.id, kind: 'CLICK', placement: impression.placement, parentId: impressionId, viewerUserId, excluded: excludedReason !== null, excludedReason },
    });
    return { location: `${target}?sp=${clickId}${practiceParam}`, clickId };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await db().sponsoredEvent.findUniqueOrThrow({ where: { parentId_kind: { parentId: impressionId, kind: 'CLICK' } } });
    return { location: `${target}?sp=${winner.id}${practiceParam}`, clickId: winner.id };
  }
}

/** A profile view or booking click that followed a sponsored click — once each. */
export async function recordSponsoredFollowUp(clickId: string, kind: 'PROFILE_VIEW' | 'BOOK_CLICK', viewerUserId: string | null): Promise<void> {
  const click = await db().sponsoredEvent.findUnique({ where: { id: clickId } });
  if (!click || click.kind !== 'CLICK') return;
  try {
    await db().sponsoredEvent.create({
      data: {
        id: newId('adEvent'),
        campaignId: click.campaignId,
        kind,
        placement: click.placement,
        parentId: clickId,
        viewerUserId,
        excluded: click.excluded,
        excludedReason: click.excluded ? click.excludedReason : null,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
}

/**
 * The campaign a booking at `practiceId` is attributed to: the click must be
 * real, counted, recent, and for this practice (or its organization).
 */
export async function attributedCampaign(clickId: string | null | undefined, practiceId: string, now: Date = new Date()): Promise<string | null> {
  if (!clickId) return null;
  const click = await db().sponsoredEvent.findUnique({ where: { id: clickId }, include: { campaign: { select: { id: true, subjectType: true, practiceId: true, organizationId: true } } } });
  if (!click || click.kind !== 'CLICK' || click.excluded) return null;
  if (now.getTime() - click.createdAt.getTime() > ATTRIBUTION_DAYS * 86_400_000) return null;
  if (click.campaign.subjectType === 'PRACTICE') return click.campaign.practiceId === practiceId ? click.campaign.id : null;
  const practice = await db().dentistPractice.findUnique({ where: { id: practiceId }, select: { location: { select: { organizationId: true } } } });
  return practice?.location.organizationId === click.campaign.organizationId ? click.campaign.id : null;
}
