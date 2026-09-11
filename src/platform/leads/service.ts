/**
 * TOOTHLOGY LEADS
 *
 * DISCOVERY → BOOKING/CALLBACK → QUALIFICATION → LEAD → DELIVERY → ACCEPTED
 *   → CONTACTED → APPOINTMENT → COMPLETED → CONVERTED
 *
 * A booking creates its lead in the same transaction as the appointment. A
 * "please call me" request creates one directly. From there, `settleLead`
 * moves a lead forward and is safe to call any number of times: it asks the
 * qualification service, charges once through the ledger, and delivers —
 * picking up wherever a previous attempt stopped. That is what lets the
 * outbox retry a failed charge without ever charging twice.
 *
 * WHO SEES WHAT
 * A practice sees its own leads only. For a callback request, the patient's
 * contact details are withheld until the lead has been paid for; a booking's
 * patient is already the practice's patient through the appointment.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { emitInTransaction } from '../events/outbox';
import { can, isAuthenticated, type Principal } from '../rbac';
import { activeRule, evaluate } from './qualification';
import { chargeLead } from '../billing/service';

type Tx = Prisma.TransactionClient;
export type LeadStatus =
  | 'NEW'
  | 'QUALIFIED'
  | 'NOT_QUALIFIED'
  | 'DUPLICATE'
  | 'DELIVERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CONTACTED'
  | 'APPOINTMENT'
  | 'COMPLETED'
  | 'CONVERTED'
  | 'LOST';

const QUALIFIED_OR_LATER: readonly LeadStatus[] = ['QUALIFIED', 'DELIVERED', 'ACCEPTED', 'CONTACTED', 'APPOINTMENT', 'COMPLETED', 'CONVERTED'];

/** Global staff roles: a lead from someone holding one is internal, never billable. */
const STAFF_ROLES = ['support_agent', 'moderator', 'platform_admin'];

/** Paid for, or free: either way the practice may now see who asked. */
const RELEASED = ['CHARGED', 'WAIVED', 'REFUNDED', 'FREE'];

/** patient × practice × service, hashed: the identity of "the same request". */
export function dedupeKeyFor(parts: {
  patientUserId: string;
  organizationId: string;
  dentistProfileId: string | null;
  serviceOfferingId: string | null;
}): string {
  return createHash('sha256')
    .update([parts.patientUserId, parts.organizationId, parts.dentistProfileId ?? '-', parts.serviceOfferingId ?? 'consultation'].join('|'))
    .digest('hex')
    .slice(0, 40);
}

async function addEvent(tx: Tx, leadId: string, action: string, from: LeadStatus | null, to: LeadStatus, extra: { actorUserId?: string | null; reason?: string | null; detail?: Prisma.InputJsonValue } = {}) {
  await tx.leadEvent.create({
    data: {
      id: newId('leadEvent'),
      leadId,
      action,
      fromStatus: from,
      toStatus: to,
      actorUserId: extra.actorUserId ?? null,
      reason: extra.reason ?? null,
      detail: extra.detail,
    },
  });
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/** Called inside the booking transaction. */
export async function createBookingLead(
  tx: Tx,
  appointment: { id: string; patientUserId: string; organizationId: string; locationId: string; dentistProfileId: string; serviceOfferingId: string | null; patientNote: string | null; campRegistrationId?: string | null },
  now: Date = new Date(),
  /** The sponsored campaign the booking is attributed to, if any. */
  campaignId: string | null = null,
) {
  const offering = appointment.serviceOfferingId
    ? await tx.serviceOffering.findUnique({ where: { id: appointment.serviceOfferingId }, select: { treatmentId: true } })
    : null;
  const id = newId('lead');
  await tx.lead.create({
    data: {
      id,
      patientUserId: appointment.patientUserId,
      organizationId: appointment.organizationId,
      locationId: appointment.locationId,
      dentistProfileId: appointment.dentistProfileId,
      serviceOfferingId: appointment.serviceOfferingId,
      treatmentId: offering?.treatmentId ?? null,
      appointmentId: appointment.id,
      campaignId,
      campRegistrationId: appointment.campRegistrationId ?? null,
      source: 'BOOKING',
      status: 'NEW',
      patientNote: appointment.patientNote,
      dedupeKey: dedupeKeyFor(appointment),
      createdAt: now,
    },
  });
  await addEvent(tx, id, 'CREATE', null, 'NEW', { actorUserId: appointment.patientUserId });
  return id;
}

export const callbackSchema = z.object({
  practiceId: z.string().min(1).max(64),
  serviceOfferingId: z.string().max(64).nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

/** "Please call me": a lead with no slot, qualified at once if the rule allows. */
export async function requestCallback(principal: Principal, raw: z.input<typeof callbackSchema>, context: { requestId?: string } = {}) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const input = callbackSchema.parse(raw);
  const practice = await db().dentistPractice.findUnique({
    where: { id: input.practiceId },
    include: { dentistProfile: { select: { userId: true, isDiscoverable: true } }, location: { select: { id: true, organizationId: true, deletedAt: true, status: true } } },
  });
  if (!practice || !practice.isConfirmed || !practice.dentistProfile.isDiscoverable || practice.location.deletedAt || practice.location.status !== 'ACTIVE') {
    throw errors.notFound('Practice');
  }
  if (practice.dentistProfile.userId === principal.userId) throw errors.validation('You cannot request a call from yourself.');
  let treatmentId: string | null = null;
  if (input.serviceOfferingId) {
    const offering = await db().serviceOffering.findFirst({ where: { id: input.serviceOfferingId, locationId: practice.locationId, isActive: true } });
    if (!offering) throw errors.validation('That service is not offered here.', { field: 'serviceOfferingId' });
    treatmentId = offering.treatmentId;
  }

  // A patient referred to this dentist at a recent camp: attributed to that visit.
  const { campReferralFor } = await import('../camps/service');
  const campRegistrationId = await campReferralFor(principal.userId, practice.dentistProfileId);

  const id = newId('lead');
  await transaction(async (tx) => {
    await tx.lead.create({
      data: {
        id,
        campRegistrationId,
        patientUserId: principal.userId,
        organizationId: practice.location.organizationId,
        locationId: practice.locationId,
        dentistProfileId: practice.dentistProfileId,
        serviceOfferingId: input.serviceOfferingId ?? null,
        treatmentId,
        source: 'CALLBACK_REQUEST',
        status: 'NEW',
        patientNote: input.note ?? null,
        dedupeKey: dedupeKeyFor({
          patientUserId: principal.userId,
          organizationId: practice.location.organizationId,
          dentistProfileId: practice.dentistProfileId,
          serviceOfferingId: input.serviceOfferingId ?? null,
        }),
      },
    });
    await addEvent(tx, id, 'CREATE', null, 'NEW', { actorUserId: principal.userId });
  });
  await recordAuditEvent({ action: 'LEAD_CALLBACK_REQUESTED', actor: principal.userId, subject: id, outcome: 'success', organizationId: practice.location.organizationId, requestId: context.requestId });
  await settleLead(id);
  return db().lead.findUniqueOrThrow({ where: { id }, select: { id: true, status: true, billingStatus: true, qualificationReason: true } });
}

// ---------------------------------------------------------------------------
// Settling: qualify → charge → deliver
// ---------------------------------------------------------------------------

async function qualify(leadId: string, now: Date): Promise<void> {
  const lead = await db().lead.findUniqueOrThrow({
    where: { id: leadId },
    include: {
      patient: { select: { email: true, emailVerifiedAt: true, phoneVerifiedAt: true } },
      appointment: { select: { status: true } },
      organization: { select: { countryCode: true } },
    },
  });
  if (lead.status !== 'NEW') return;

  const rule = await activeRule(lead.organization.countryCode, now);
  const windowStart = new Date(now.getTime() - rule.criteria.dedupeWindowDays * 86_400_000);
  const [earlier, membership, staffRoles] = await Promise.all([
    db().lead.findFirst({
      where: {
        dedupeKey: lead.dedupeKey,
        id: { not: lead.id },
        createdAt: { gte: windowStart, lte: lead.createdAt },
        OR: [{ status: { in: ['NEW', ...QUALIFIED_OR_LATER] } }, { billingStatus: { in: ['CHARGED', 'PENDING_FUNDS'] } }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, createdAt: true },
    }),
    db().organizationMember.count({ where: { organizationId: lead.organizationId, userId: lead.patientUserId, leftAt: null } }),
    db().roleAssignment.count({
      where: { userId: lead.patientUserId, roleKey: { in: STAFF_ROLES }, organizationId: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
  ]);
  // Two leads created in the same millisecond: the smaller id is the original.
  const duplicateOf = earlier && (earlier.createdAt < lead.createdAt || earlier.id < lead.id) ? earlier.id : null;

  const decision = evaluate(rule.criteria, {
    source: lead.source,
    appointmentStatus: lead.appointment?.status ?? null,
    patientContactVerified: Boolean(lead.patient.emailVerifiedAt || lead.patient.phoneVerifiedAt),
    earlierDuplicateId: duplicateOf,
    patientIsPracticeMember: membership > 0,
    patientIsStaff: staffRoles > 0,
    patientEmail: lead.patient.email,
  });
  if (decision.decision === 'WAIT') return;

  await transaction(async (tx) => {
    const to: LeadStatus = decision.decision;
    const claim = await tx.lead.updateMany({
      where: { id: lead.id, status: 'NEW' },
      data: {
        status: to,
        qualificationRuleId: rule.id,
        qualificationRuleVersion: rule.version,
        qualificationReason: decision.reason,
        qualifiedAt: to === 'QUALIFIED' ? now : null,
        duplicateOfId: decision.decision === 'DUPLICATE' ? decision.duplicateOfId : null,
      },
    });
    if (claim.count === 0) return; // someone else decided it first
    await addEvent(tx, lead.id, 'QUALIFY', 'NEW', to, { reason: decision.reason, detail: { ruleId: rule.id, ruleVersion: rule.version } });
  });
}

async function deliver(leadId: string, now: Date): Promise<void> {
  const lead = await db().lead.findUniqueOrThrow({ where: { id: leadId }, include: { appointment: { select: { status: true } } } });
  if (lead.status !== 'QUALIFIED') return;

  if (lead.source === 'BOOKING') {
    // The practice already has this patient's appointment; its confirmation
    // is its acceptance. Record each step, so the lead's history is complete.
    const appointmentActive = ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'].includes(lead.appointment?.status ?? '');
    await transaction(async (tx) => {
      const claim = await tx.lead.updateMany({
        where: { id: lead.id, status: 'QUALIFIED' },
        data: { status: appointmentActive ? 'APPOINTMENT' : 'DELIVERED', deliveredAt: now, acceptedAt: appointmentActive ? now : null },
      });
      if (claim.count === 0) return;
      await addEvent(tx, lead.id, 'DELIVER', 'QUALIFIED', 'DELIVERED');
      if (appointmentActive) {
        await addEvent(tx, lead.id, 'ACCEPT', 'DELIVERED', 'ACCEPTED', { reason: 'The practice confirmed the appointment.' });
        await addEvent(tx, lead.id, 'APPOINTMENT', 'ACCEPTED', 'APPOINTMENT');
      }
    });
    if (lead.appointment?.status === 'COMPLETED') await onAppointmentOutcome(lead.appointmentId!, 'COMPLETED', now);
    return;
  }

  // A callback request is only delivered once it is paid for (or free): before
  // that the practice sees that a request exists, never who made it.
  if (!['CHARGED', 'WAIVED', 'FREE'].includes(lead.billingStatus)) return;
  await transaction(async (tx) => {
    const claim = await tx.lead.updateMany({ where: { id: lead.id, status: 'QUALIFIED' }, data: { status: 'DELIVERED', deliveredAt: now } });
    if (claim.count === 0) return;
    await addEvent(tx, lead.id, 'DELIVER', 'QUALIFIED', 'DELIVERED');
    await emitInTransaction(tx, 'LEAD_CREATED', { leadId: lead.id, organizationId: lead.organizationId, dentistProfileId: lead.dentistProfileId, source: lead.source }, { actor: 'system' });
  });
}

/**
 * Move a lead as far forward as its facts allow. Idempotent and re-entrant:
 * after a failure at any step, calling again resumes from that step.
 */
export async function settleLead(leadId: string, now: Date = new Date()): Promise<void> {
  await qualify(leadId, now);
  const lead = await db().lead.findUniqueOrThrow({ where: { id: leadId } });
  if (!QUALIFIED_OR_LATER.includes(lead.status as LeadStatus)) return;
  if (lead.billingStatus === 'NOT_BILLABLE') {
    // Throws if pricing or tax is not configured, which leaves the lead
    // qualified and unbilled for the retry to finish — never billed at zero.
    await chargeLead(leadId, now);
  }
  await deliver(leadId, now);
}

/** Keep a booking's lead in step with its appointment. */
export async function onAppointmentOutcome(appointmentId: string, outcome: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED' | 'NO_SHOW', now: Date = new Date()): Promise<void> {
  const lead = await db().lead.findUnique({ where: { appointmentId } });
  if (!lead) return;

  if (outcome === 'CONFIRMED' || outcome === 'COMPLETED') {
    await settleLead(lead.id, now);
    if (outcome === 'COMPLETED') {
      await transaction(async (tx) => {
        const claim = await tx.lead.updateMany({ where: { id: lead.id, status: 'APPOINTMENT' }, data: { status: 'COMPLETED', completedAt: now } });
        if (claim.count > 0) await addEvent(tx, lead.id, 'COMPLETE', 'APPOINTMENT', 'COMPLETED', { reason: 'The visit took place.' });
      });
    }
    return;
  }

  // The appointment did not happen. A lead never qualified is simply lost and
  // costs nothing; a charged one stays charged, and the practice may dispute it.
  const fresh = await db().lead.findUniqueOrThrow({ where: { id: lead.id } });
  if (['COMPLETED', 'CONVERTED', 'LOST', 'NOT_QUALIFIED', 'DUPLICATE', 'REJECTED'].includes(fresh.status)) return;
  await transaction(async (tx) => {
    const claim = await tx.lead.updateMany({ where: { id: lead.id, status: fresh.status }, data: { status: 'LOST' } });
    if (claim.count > 0) await addEvent(tx, lead.id, 'LOSE', fresh.status as LeadStatus, 'LOST', { reason: `Appointment ${outcome.toLowerCase().replace('_', '-')}.` });
  });
}

/** After a credit: charge waiting leads, oldest first, until funds run out. */
export async function retryPendingFunds(organizationId: string, now: Date = new Date()): Promise<number> {
  const waiting = await db().lead.findMany({ where: { organizationId, billingStatus: 'PENDING_FUNDS' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  let charged = 0;
  for (const { id } of waiting) {
    const result = await chargeLead(id, now);
    if (result.status !== 'CHARGED') break;
    charged += 1;
    await deliver(id, now);
  }
  return charged;
}

// ---------------------------------------------------------------------------
// Practice actions
// ---------------------------------------------------------------------------

export const leadActionSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT', 'CONTACTED', 'MARK_APPOINTMENT', 'CONVERTED', 'LOST']),
  reason: z.string().trim().max(500).optional(),
});

const LEAD_TRANSITIONS: Record<z.infer<typeof leadActionSchema>['action'], { from: LeadStatus[]; to: LeadStatus; event?: string }> = {
  ACCEPT: { from: ['DELIVERED'], to: 'ACCEPTED', event: 'LEAD_ACCEPTED' },
  REJECT: { from: ['DELIVERED'], to: 'REJECTED' },
  CONTACTED: { from: ['ACCEPTED'], to: 'CONTACTED' },
  MARK_APPOINTMENT: { from: ['ACCEPTED', 'CONTACTED'], to: 'APPOINTMENT' },
  CONVERTED: { from: ['COMPLETED'], to: 'CONVERTED' },
  LOST: { from: ['ACCEPTED', 'CONTACTED'], to: 'LOST' },
};

export async function assertPracticeAccess(principal: Principal, lead: { organizationId: string; dentistProfileId: string | null }, permission: 'tl.leads.lead.read' | 'tl.leads.lead.manage'): Promise<void> {
  if (!isAuthenticated(principal)) throw errors.notFound('Lead');
  if (can(principal, permission, { organizationId: lead.organizationId })) return;
  if (lead.dentistProfileId) {
    const profile = await db().dentistProfile.findUnique({ where: { id: lead.dentistProfileId }, select: { userId: true } });
    if (profile?.userId === principal.userId) return;
  }
  // A lead in another practice does not exist, as far as this caller knows.
  throw errors.notFound('Lead');
}

export async function actOnLead(principal: Principal, leadId: string, raw: z.input<typeof leadActionSchema>, context: { requestId?: string; now?: Date } = {}) {
  const input = leadActionSchema.parse(raw);
  const now = context.now ?? new Date();
  const lead = await db().lead.findUnique({ where: { id: leadId } });
  if (!lead) throw errors.notFound('Lead');
  await assertPracticeAccess(principal, lead, 'tl.leads.lead.manage');
  const rule = LEAD_TRANSITIONS[input.action];
  if (!rule.from.includes(lead.status as LeadStatus)) {
    throw errors.preconditionFailed(`A lead that is ${lead.status.toLowerCase()} cannot be marked ${rule.to.toLowerCase()}.`);
  }
  if ((input.action === 'REJECT' || input.action === 'LOST') && !input.reason) throw errors.validation('Give a reason.', { field: 'reason' });
  const actorUserId = isAuthenticated(principal) ? principal.userId : null;
  const stamp: Record<string, Date> = { ACCEPTED: { acceptedAt: now }, REJECTED: { rejectedAt: now }, CONTACTED: { contactedAt: now }, CONVERTED: { convertedAt: now } }[rule.to as string] as never ?? {};

  await transaction(async (tx) => {
    const claim = await tx.lead.updateMany({
      where: { id: lead.id, status: lead.status },
      data: { status: rule.to, ...stamp, ...(rule.to === 'REJECTED' ? { rejectionReason: input.reason ?? null } : {}) },
    });
    if (claim.count === 0) throw errors.conflict('This lead changed while you were acting on it. Refresh and try again.');
    await addEvent(tx, lead.id, input.action, lead.status as LeadStatus, rule.to, { actorUserId, reason: input.reason ?? null });
    if (rule.event) {
      await emitInTransaction(tx, rule.event, { leadId: lead.id, organizationId: lead.organizationId, patientUserId: lead.patientUserId }, { requestId: context.requestId, actor: actorUserId ?? 'system' });
    }
  });
  await recordAuditEvent({ action: `LEAD_${input.action}`, actor: actorUserId ?? 'system', subject: lead.id, outcome: 'success', organizationId: lead.organizationId, requestId: context.requestId });
  return db().lead.findUniqueOrThrow({ where: { id: lead.id } });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type LeadRow = Prisma.LeadGetPayload<{
  include: {
    patient: { select: { displayName: true; email: true; phone: true } };
    serviceOffering: { select: { name: true } };
    location: { select: { name: true } };
    appointment: { select: { id: true; startsAt: true; status: true } };
    dispute: { select: { status: true; reason: true } };
    assignedTo: { select: { displayName: true } };
    events: true;
  };
}>;

/** Lead events that record work on the lead rather than a change of status. */
const WORK_ACTIONS = ['CALL_LOGGED', 'NOTE', 'ASSIGNED', 'UNASSIGNED', 'FOLLOW_UP_SET', 'FOLLOW_UP_CLEARED'];

/** What a practice may see of a lead: contact only once it is theirs. */
export function presentLead(lead: LeadRow) {
  const contactVisible = lead.source === 'BOOKING' || RELEASED.includes(lead.billingStatus);
  return {
    id: lead.id,
    source: lead.source,
    status: lead.status,
    billingStatus: lead.billingStatus,
    service: lead.serviceOffering?.name ?? 'Consultation',
    location: lead.location.name,
    patientNote: lead.patientNote,
    patientName: contactVisible ? (lead.patient.displayName ?? 'Patient') : 'Patient (details after payment)',
    patientEmail: contactVisible ? lead.patient.email : null,
    patientPhone: contactVisible ? lead.patient.phone : null,
    appointment: lead.appointment,
    qualificationReason: lead.qualificationReason,
    priceMinor: lead.priceMinor?.toString() ?? null,
    taxMinor: lead.taxMinor?.toString() ?? null,
    currency: lead.currency,
    billingOrdinal: lead.billingOrdinal,
    dispute: lead.dispute,
    createdAt: lead.createdAt.toISOString(),
    qualifiedAt: lead.qualifiedAt?.toISOString() ?? null,
    contactVisible,
    assignedToUserId: lead.assignedToUserId,
    assignedToName: lead.assignedTo?.displayName ?? null,
    nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
    workLog: lead.events.map((e) => ({ id: e.id, action: e.action, detail: e.detail as { outcome?: string; note?: string | null; at?: string | null; followUpAt?: string | null } | null, createdAt: e.createdAt.toISOString() })),
  };
}

export async function listLeads(principal: Principal, organizationId: string, filter: { status?: string } = {}) {
  if (!can(principal, 'tl.leads.lead.read', { organizationId })) throw errors.notFound('Organization');
  const rows = await db().lead.findMany({
    where: { organizationId, ...(filter.status ? { status: filter.status as LeadStatus } : {}) },
    include: {
      patient: { select: { displayName: true, email: true, phone: true } },
      serviceOffering: { select: { name: true } },
      location: { select: { name: true } },
      appointment: { select: { id: true, startsAt: true, status: true } },
      dispute: { select: { status: true, reason: true } },
      assignedTo: { select: { displayName: true } },
      events: { where: { action: { in: WORK_ACTIONS } }, orderBy: { createdAt: 'desc' }, take: 5 },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map(presentLead);
}

const magnitude = (v: bigint | null) => (v === null ? BigInt(0) : v < BigInt(0) ? -v : v);

/**
 * The lead dashboard's numbers. Counts come from the leads; money comes from
 * the ledger (charges less refunds), never from the leads' own price fields,
 * so the dashboard and the statement cannot disagree.
 */
export async function leadStats(principal: Principal, organizationId: string) {
  if (!can(principal, 'tl.leads.lead.read', { organizationId })) throw errors.notFound('Organization');
  const [byStatus, byBilling, delivered, qualified, wallet] = await Promise.all([
    db().lead.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
    db().lead.groupBy({ by: ['billingStatus'], where: { organizationId }, _count: true }),
    db().lead.count({ where: { organizationId, deliveredAt: { not: null } } }),
    // Leads that actually qualified — not every LOST lead did (a request
    // cancelled before confirmation never qualifies).
    db().lead.count({ where: { organizationId, qualifiedAt: { not: null } } }),
    db().wallet.findUnique({ where: { organizationId } }),
  ]);
  const money = wallet
    ? await db().ledgerEntry.findMany({ where: { walletId: wallet.id, kind: { in: ['LEAD_CHARGE', 'REFUND'] } }, select: { kind: true, amountMinor: true, taxMinor: true } })
    : [];
  const signed = (kind: string) => (kind === 'REFUND' ? BigInt(-1) : BigInt(1));
  const spendGross = money.reduce((t, e) => t + signed(e.kind) * magnitude(e.amountMinor), BigInt(0));
  const spendTax = money.reduce((t, e) => t + signed(e.kind) * magnitude(e.taxMinor), BigInt(0));

  const count = (s: string) => byStatus.find((r) => r.status === s)?._count ?? 0;
  const billing = (s: string) => byBilling.find((r) => r.billingStatus === s)?._count ?? 0;
  const converted = count('CONVERTED');
  // A converted lead necessarily had its visit, so it counts as visited too.
  const visited = count('COMPLETED') + converted;
  const rate = (n: number) => (qualified > 0 ? Math.round((n / qualified) * 1000) / 10 : null);
  return {
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
    byBilling: Object.fromEntries(byBilling.map((r) => [r.billingStatus, r._count])),
    total: byStatus.reduce((n, r) => n + r._count, 0),
    qualified,
    free: billing('FREE'),
    paid: billing('CHARGED'),
    refunded: billing('REFUNDED'),
    pendingFunds: billing('PENDING_FUNDS'),
    delivered,
    completed: visited,
    visited,
    converted,
    rejected: count('REJECTED'),
    duplicate: count('DUPLICATE'),
    notQualified: count('NOT_QUALIFIED'),
    currency: wallet?.currency ?? null,
    /** Charged, less refunds, tax included. */
    spendGrossMinor: spendGross,
    spendNetMinor: spendGross - spendTax,
    gstMinor: spendTax,
    walletBalanceMinor: wallet?.balanceMinor ?? BigInt(0),
    /** Qualified leads that led to a completed visit. Null until there is one to divide by. */
    visitRate: rate(visited),
    /** Qualified leads the practice marked as going ahead with treatment. */
    conversionRate: rate(converted),
  };
}
