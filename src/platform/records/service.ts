/**
 * TOOTHLOGY DENTAL RECORD — patient-owned, shared only with the patient's leave
 *
 * Constitution P4: patients own their health data. So:
 * - The patient always sees their whole record — what they added, what any
 *   practice added, every prescription — including after a practice's access
 *   has ended.
 * - A practice sees a record only while the patient's grant to it is active:
 *   asked for by the practice or given by the patient, read-only or
 *   read-and-add, time-limited or until withdrawn, revocable at any moment.
 *   Every active grant carries a CLINICAL_DATA_SHARING consent row. Every
 *   practice view is audited, and the patient sees who looked
 *   (`accessHistory`), including who opened which file.
 * - A practice corrects its own entry by retracting it with a reason; clinical
 *   history is never silently edited. Patients may delete what they added.
 * - Prescriptions come only from a dentist Toothlogy has verified, at the
 *   practice, under a grant that allows adding. They are cancelled, never
 *   edited; a pharmacist checks one by the QR code on the printout.
 * - Notifications name who did something, never the clinical detail.
 * - To a practice without a grant, a patient's record does not exist
 *   (not-found, not forbidden).
 */

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Prisma, type RecordEntryKind } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyOrganizationAdmins, notifyUser } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { deleteFile, uploadFile, type FilePurpose } from '../storage/files';
import { FILE_KINDS } from './labels';

export { ENTRY_KINDS, ENTRY_KIND_LABEL, GRANT_DURATIONS } from './labels';

export const READ = 'tl.records.record.read';
export const WRITE = 'tl.records.record.write';
export const PRESCRIBE = 'tl.records.prescription.issue';
const DAY = 86_400_000;
const CONSENT_POLICY = 'clinical-data-sharing/2026-09';
const ENTRIES_PER_DAY = 40;

const NEEDS_FILE = FILE_KINDS;
const PURPOSE_FOR_KIND: Readonly<Record<RecordEntryKind, FilePurpose>> = { IMAGING: 'XRAY', REPORT: 'DENTAL_REPORT', DOCUMENT: 'DENTAL_REPORT', TREATMENT: 'DENTAL_REPORT', VISIT_NOTE: 'DENTAL_REPORT' };
const duration = z.enum(['30', '365', '0']);

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return principal;
}

/**
 * Validate as the routes do: a bad input is a VALIDATION_FAILED naming the
 * field, whether it came through a JSON route, a multipart form or a job.
 */
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  throw errors.validation(issue.message, issue.path.length ? { field: issue.path.map(String).join('.') } : undefined);
}

async function nameOf(userId: string, fallback: string) {
  return (await db().user.findUnique({ where: { id: userId }, select: { displayName: true } }))?.displayName ?? fallback;
}
async function practiceName(organizationId: string) {
  return (await db().organization.findUnique({ where: { id: organizationId }, select: { name: true } }))?.name ?? 'A practice';
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const FDI = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/;

/** "16, 26 36" → [16, 26, 36]. FDI notation: 11–48 permanent, 51–85 milk teeth. */
export function parseTeeth(text: string | undefined): number[] {
  if (!text || !text.trim()) return [];
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length > 32) throw errors.validation('At most 32 teeth.', { field: 'teeth' });
  const bad = parts.find((p) => !FDI.test(p));
  if (bad) throw errors.validation(`“${bad.slice(0, 10)}” is not a tooth number (FDI: 11–48; milk teeth 51–85).`, { field: 'teeth' });
  return [...new Set(parts.map(Number))].sort((a, b) => a - b);
}

export const entrySchema = z.object({
  kind: z.enum(['TREATMENT', 'VISIT_NOTE', 'IMAGING', 'REPORT', 'DOCUMENT']),
  title: z.string().trim().min(3, 'Give it a title.').max(160),
  notes: z.string().trim().max(4000).optional(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date.'),
  teeth: z.string().max(160).optional(),
  dependentId: z.string().max(64).optional(),
  appointmentId: z.string().max(64).optional(),
});

export interface UploadedBytes {
  readonly filename: string;
  readonly declaredType: string;
  readonly bytes: Uint8Array;
}

interface Context {
  readonly requestId?: string;
  readonly ipAddress?: string | null;
  readonly now?: Date;
}

function entryDate(text: string, now: Date): Date {
  const d = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900) throw errors.validation('Choose the date.', { field: 'occurredOn' });
  // A day of slack for time zones east of UTC.
  if (d.getTime() > now.getTime() + DAY) throw errors.validation('That date is in the future.', { field: 'occurredOn' });
  return d;
}

async function checkDependent(patientUserId: string, dependentId: string | undefined): Promise<string | null> {
  if (!dependentId) return null;
  const d = await db().dependent.findFirst({ where: { id: dependentId, guardianUserId: patientUserId, deletedAt: null }, select: { id: true } });
  if (!d) throw errors.validation('Choose one of the family members on this account.', { field: 'dependentId' });
  return d.id;
}

async function createEntry(me: AuthenticatedPrincipal, patientUserId: string, organizationId: string | null, raw: z.input<typeof entrySchema>, file: UploadedBytes | undefined, context: Context): Promise<string> {
  const input = parse(entrySchema, raw);
  const now = context.now ?? new Date();
  const teeth = parseTeeth(input.teeth);
  const occurredOn = entryDate(input.occurredOn, now);
  const dependentId = await checkDependent(patientUserId, input.dependentId);
  if (NEEDS_FILE.has(input.kind) && !file) throw errors.validation('Attach the file.', { field: 'file' });
  if (!file && !input.notes) throw errors.validation('Write a note or attach a file.', { field: 'notes' });
  if (input.appointmentId) {
    const owns = await db().appointment.count({ where: { id: input.appointmentId, patientUserId, ...(organizationId ? { organizationId } : {}) } });
    if (!owns) throw errors.validation('That appointment is not this patient’s.', { field: 'appointmentId' });
  }
  if ((await db().recordEntry.count({ where: { authorUserId: me.userId, createdAt: { gte: new Date(now.getTime() - DAY) } } })) >= ENTRIES_PER_DAY) {
    throw errors.rateLimited(3600);
  }
  // The file belongs to the patient whoever uploads it: it is their record.
  const uploaded = file
    ? await uploadFile({ principal: me, purpose: PURPOSE_FOR_KIND[input.kind], filename: file.filename, declaredType: file.declaredType, bytes: file.bytes, ownerUserId: patientUserId, ipAddress: context.ipAddress, requestId: context.requestId })
    : null;
  const id = newId('record');
  await db().recordEntry.create({
    data: { id, patientUserId, dependentId, kind: input.kind, title: input.title, notes: input.notes || null, teeth, occurredOn, fileId: uploaded?.id ?? null, authorUserId: me.userId, organizationId, appointmentId: input.appointmentId ?? null, createdAt: now },
  });
  return id;
}

const entryInclude = {
  organization: { select: { id: true, name: true } },
  author: { select: { displayName: true } },
  dependent: { select: { id: true, name: true } },
  file: { select: { id: true, contentType: true, originalFilename: true, sizeBytes: true, status: true } },
} satisfies Prisma.RecordEntryInclude;

const rxListInclude = {
  organization: { select: { name: true } },
  prescriber: { select: { displayName: true } },
  dependent: { select: { name: true } },
} satisfies Prisma.PrescriptionInclude;

async function loadRecord(patientUserId: string) {
  const [entries, prescriptions, treatmentPlans] = await Promise.all([
    db().recordEntry.findMany({ where: { patientUserId, deletedAt: null }, include: entryInclude, orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }], take: 500 }),
    db().prescription.findMany({ where: { patientUserId }, include: rxListInclude, orderBy: { issuedAt: 'desc' }, take: 200 }),
    db().treatmentPlan.findMany({
      where: { patientUserId },
      include: { items: { orderBy: { position: 'asc' } }, organization: { select: { id: true, name: true } }, dependent: { select: { name: true } }, author: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  return { entries, prescriptions: prescriptions.map((rx) => ({ ...rx, items: rx.items as unknown as RxItem[] })), treatmentPlans };
}

// ---------------------------------------------------------------------------
// The patient
// ---------------------------------------------------------------------------

const HISTORY_LABEL: Readonly<Record<string, string>> = {
  RECORD_VIEWED: 'opened your record',
  RECORD_ENTRY_ADDED: 'added to your record',
  RECORD_ENTRY_RETRACTED: 'retracted an entry they had added',
  PRESCRIPTION_ISSUED: 'issued a prescription',
  PRESCRIPTION_CANCELLED: 'cancelled a prescription',
  TREATMENT_PLAN_PROPOSED: 'proposed a treatment plan',
  TREATMENT_PLAN_UPDATED: 'recorded progress on a treatment plan',
  TREATMENT_PLAN_CANCELLED: 'withdrew a treatment plan',
};

/** Who, other than the patient, looked at or changed the record — newest first. */
export async function accessHistory(patientUserId: string, limit = 50) {
  const [events, fileReads] = await Promise.all([
    db().auditEvent.findMany({
      where: { subject: patientUserId, action: { in: Object.keys(HISTORY_LABEL) }, actor: { not: patientUserId }, outcome: 'SUCCESS' },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      select: { action: true, actor: true, organizationId: true, occurredAt: true },
    }),
    db().fileAccessLog.findMany({
      where: { action: 'SIGN_URL', outcome: 'SUCCESS', actor: { not: patientUserId }, file: { ownerUserId: patientUserId, recordEntry: { isNot: null } } },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      select: { actor: true, occurredAt: true, file: { select: { recordEntry: { select: { title: true } } } } },
    }),
  ]);
  const actorIds = [...new Set([...events.map((e) => e.actor), ...fileReads.map((f) => f.actor)])];
  const orgIds = [...new Set(events.map((e) => e.organizationId).filter((x): x is string => Boolean(x)))];
  const [users, orgs] = await Promise.all([
    db().user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } }),
    db().organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }),
  ]);
  const who = new Map(users.map((u) => [u.id, u.displayName ?? 'Someone']));
  const org = new Map(orgs.map((o) => [o.id, o.name]));
  return [
    ...events.map((e) => ({ at: e.occurredAt, who: who.get(e.actor) ?? 'Toothlogy', practice: e.organizationId ? (org.get(e.organizationId) ?? null) : null, what: HISTORY_LABEL[e.action] ?? e.action })),
    ...fileReads.map((f) => ({ at: f.occurredAt, who: who.get(f.actor) ?? 'Someone', practice: null, what: `opened “${f.file.recordEntry?.title ?? 'a file'}”` })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}

export async function myRecord(principal: Principal) {
  const me = signedIn(principal);
  const now = Date.now();
  const [record, grants, dependents, visited, history] = await Promise.all([
    loadRecord(me.userId),
    db().recordAccessGrant.findMany({ where: { patientUserId: me.userId, status: { in: ['REQUESTED', 'ACTIVE'] } }, include: { organization: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } }),
    db().dependent.findMany({ where: { guardianUserId: me.userId, deletedAt: null }, select: { id: true, name: true } }),
    db().appointment.findMany({ where: { patientUserId: me.userId }, select: { organizationId: true, organization: { select: { name: true } } }, distinct: ['organizationId'] }),
    accessHistory(me.userId),
  ]);
  const live = grants.filter((g) => g.status === 'REQUESTED' || !g.expiresAt || g.expiresAt.getTime() > now);
  const open = new Set(live.map((g) => g.organizationId));
  return {
    ...record,
    requests: live.filter((g) => g.status === 'REQUESTED'),
    grants: live.filter((g) => g.status === 'ACTIVE'),
    dependents,
    shareable: visited.filter((v) => !open.has(v.organizationId)).map((v) => ({ organizationId: v.organizationId, name: v.organization.name })),
    history,
  };
}

export async function addMyEntry(principal: Principal, raw: z.input<typeof entrySchema>, file?: UploadedBytes, context: Context = {}) {
  const me = signedIn(principal);
  const entryId = await createEntry(me, me.userId, null, raw, file, context);
  await recordAuditEvent({ action: 'RECORD_ENTRY_ADDED', actor: me.userId, subject: me.userId, outcome: 'success', requestId: context.requestId, detail: { entryId } });
  return { entryId };
}

/** The patient deletes what they added. What a practice added, they cannot. */
export async function deleteMyEntry(principal: Principal, entryId: string, context: Context = {}) {
  const me = signedIn(principal);
  const entry = await db().recordEntry.findFirst({ where: { id: entryId, patientUserId: me.userId, authorUserId: me.userId, organizationId: null, deletedAt: null } });
  if (!entry) throw errors.notFound('Record entry');
  await db().recordEntry.update({ where: { id: entry.id }, data: { deletedAt: context.now ?? new Date() } });
  if (entry.fileId) await deleteFile(me, entry.fileId, { requestId: context.requestId, ipAddress: context.ipAddress });
  await recordAuditEvent({ action: 'RECORD_ENTRY_DELETED', actor: me.userId, subject: me.userId, outcome: 'success', requestId: context.requestId, detail: { entryId } });
  return { deleted: true };
}

function grantTerms(canWrite: boolean, days: z.infer<typeof duration>, now: Date) {
  return { canWrite, expiresAt: days === '0' ? null : new Date(now.getTime() + Number(days) * DAY) };
}

/** REQUESTED → ACTIVE with a consent row; refused if someone else moved it first. */
async function activate(grantId: string, patientUserId: string, terms: ReturnType<typeof grantTerms>, now: Date, ipAddress: string | null | undefined) {
  await transaction(async (tx) => {
    const consentId = newId('consent');
    await tx.consent.create({ data: { id: consentId, userId: patientUserId, purpose: 'CLINICAL_DATA_SHARING', policyVersion: CONSENT_POLICY, ipAddress: ipAddress ?? null, grantedAt: now } });
    const moved = await tx.recordAccessGrant.updateMany({ where: { id: grantId, status: 'REQUESTED' }, data: { status: 'ACTIVE', ...terms, grantedAt: now, consentId } });
    if (moved.count === 0) throw errors.conflict('This was already decided. Refresh to see it.');
  });
}

export const grantSchema = z.object({ organizationId: z.string().max(64), canWrite: z.boolean(), days: duration });

/** The patient shares their record with a practice they have been to (or changes the terms). */
export async function grantAccess(principal: Principal, raw: z.input<typeof grantSchema>, context: Context = {}) {
  const me = signedIn(principal);
  const input = parse(grantSchema, raw);
  const now = context.now ?? new Date();
  const organization = await db().organization.findFirst({ where: { id: input.organizationId, deletedAt: null }, select: { id: true, name: true } });
  if (!organization) throw errors.notFound('Practice');
  if ((await db().appointment.count({ where: { patientUserId: me.userId, organizationId: organization.id } })) === 0) {
    throw errors.preconditionFailed('You can share your record with a practice you have an appointment with.');
  }
  const terms = grantTerms(input.canWrite, input.days, now);
  const openKey = `${me.userId}:${organization.id}`;
  let grantId: string;
  const open = await db().recordAccessGrant.findUnique({ where: { openKey } });
  if (open?.status === 'ACTIVE') {
    await db().recordAccessGrant.update({ where: { id: open.id }, data: terms });
    grantId = open.id;
  } else {
    grantId = open?.id ?? newId('accessGrant');
    if (!open) {
      try {
        await db().recordAccessGrant.create({ data: { id: grantId, patientUserId: me.userId, organizationId: organization.id, status: 'REQUESTED', openKey } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('This practice already has access or a request waiting. Refresh to see it.');
        throw error;
      }
    }
    await activate(grantId, me.userId, terms, now, context.ipAddress);
  }
  await recordAuditEvent({ action: 'RECORD_ACCESS_GRANTED', actor: me.userId, subject: me.userId, organizationId: organization.id, outcome: 'success', requestId: context.requestId, detail: { grantId, canWrite: input.canWrite, days: input.days } });
  await notifyOrganizationAdmins({ organizationId: organization.id, notificationId: 'TL-NOTIF-RECORD-ACCESS-DECISION-001', data: { patient: await nameOf(me.userId, 'A patient'), decision: 'shared their dental record with you' }, linkUrl: `/account/organizations/${organization.id}/patients/${me.userId}` });
  return { grantId };
}

export const respondSchema = z.object({ decision: z.enum(['APPROVE', 'DECLINE']), canWrite: z.boolean().optional(), days: duration.optional() });

/** The patient answers a practice's request. */
export async function respondToRequest(principal: Principal, grantId: string, raw: z.input<typeof respondSchema>, context: Context = {}) {
  const me = signedIn(principal);
  const input = parse(respondSchema, raw);
  const now = context.now ?? new Date();
  const grant = await db().recordAccessGrant.findFirst({ where: { id: grantId, patientUserId: me.userId, status: 'REQUESTED' } });
  if (!grant) throw errors.notFound('Request');
  if (input.decision === 'DECLINE') {
    const moved = await db().recordAccessGrant.updateMany({ where: { id: grant.id, status: 'REQUESTED' }, data: { status: 'DECLINED', endedAt: now, endedReason: 'Declined by the patient', openKey: null } });
    if (moved.count === 0) throw errors.conflict('This was already decided. Refresh to see it.');
  } else {
    await activate(grant.id, me.userId, grantTerms(input.canWrite ?? false, input.days ?? '30', now), now, context.ipAddress);
  }
  const approved = input.decision === 'APPROVE';
  await recordAuditEvent({ action: approved ? 'RECORD_ACCESS_GRANTED' : 'RECORD_ACCESS_DECLINED', actor: me.userId, subject: me.userId, organizationId: grant.organizationId, outcome: 'success', requestId: context.requestId, detail: { grantId: grant.id } });
  await notifyOrganizationAdmins({
    organizationId: grant.organizationId,
    notificationId: 'TL-NOTIF-RECORD-ACCESS-DECISION-001',
    data: { patient: await nameOf(me.userId, 'A patient'), decision: approved ? 'allowed you to see their dental record' : 'declined your request to see their dental record' },
    linkUrl: approved ? `/account/organizations/${grant.organizationId}/patients/${me.userId}` : `/account/organizations/${grant.organizationId}/patients`,
  });
  return { status: approved ? 'ACTIVE' : 'DECLINED' };
}

/** The patient withdraws a practice's access, effective at once. */
export async function revokeGrant(principal: Principal, grantId: string, context: Context = {}) {
  const me = signedIn(principal);
  const now = context.now ?? new Date();
  const grant = await db().recordAccessGrant.findFirst({ where: { id: grantId, patientUserId: me.userId, status: 'ACTIVE' } });
  if (!grant) throw errors.notFound('Access');
  await transaction(async (tx) => {
    const moved = await tx.recordAccessGrant.updateMany({ where: { id: grant.id, status: 'ACTIVE' }, data: { status: 'REVOKED', endedAt: now, endedReason: 'Withdrawn by the patient', openKey: null } });
    if (moved.count === 0) throw errors.notFound('Access');
    if (grant.consentId) await tx.consent.update({ where: { id: grant.consentId }, data: { revokedAt: now } });
  });
  await recordAuditEvent({ action: 'RECORD_ACCESS_REVOKED', actor: me.userId, subject: me.userId, organizationId: grant.organizationId, outcome: 'success', requestId: context.requestId, detail: { grantId: grant.id } });
  await notifyOrganizationAdmins({ organizationId: grant.organizationId, notificationId: 'TL-NOTIF-RECORD-ACCESS-DECISION-001', data: { patient: await nameOf(me.userId, 'A patient'), decision: 'withdrew your access to their dental record' }, linkUrl: `/account/organizations/${grant.organizationId}/patients` });
  return { status: 'REVOKED' };
}

/** A job: end grants whose time is up, withdrawing the consent each carried. */
export async function expireGrants(now = new Date()) {
  const due = await db().recordAccessGrant.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: now } }, select: { id: true, consentId: true }, take: 500 });
  if (due.length === 0) return { expired: 0 };
  await transaction(async (tx) => {
    await tx.recordAccessGrant.updateMany({ where: { id: { in: due.map((g) => g.id) }, status: 'ACTIVE' }, data: { status: 'EXPIRED', endedAt: now, endedReason: 'Expired', openKey: null } });
    const consentIds = due.map((g) => g.consentId).filter((x): x is string => Boolean(x));
    if (consentIds.length) await tx.consent.updateMany({ where: { id: { in: consentIds }, revokedAt: null }, data: { revokedAt: now } });
  });
  return { expired: due.length };
}

// ---------------------------------------------------------------------------
// The practice
// ---------------------------------------------------------------------------

export async function activeGrantFor(me: AuthenticatedPrincipal, organizationId: string, patientUserId: string, now = new Date()) {
  if (!can(me, READ, { organizationId })) return null;
  return db().recordAccessGrant.findFirst({ where: { patientUserId, organizationId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
}

async function verifiedDentist(userId: string) {
  return db().dentistProfile.findFirst({ where: { userId, isVerified: true, status: 'VERIFIED', deletedAt: null }, select: { id: true } });
}

/** Patients who shared their record, requests waiting, and recent patients one may ask. */
export async function practicePatients(principal: Principal, organizationId: string) {
  const me = signedIn(principal);
  if (!can(me, READ, { organizationId })) throw errors.notFound('Organization');
  const now = new Date();
  const [organization, grants, recent] = await Promise.all([
    db().organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true, name: true } }),
    db().recordAccessGrant.findMany({ where: { organizationId, status: { in: ['REQUESTED', 'ACTIVE'] } }, include: { patient: { select: { id: true, displayName: true } } }, orderBy: { updatedAt: 'desc' } }),
    db().appointment.findMany({ where: { organizationId, startsAt: { gte: new Date(now.getTime() - 400 * DAY) } }, select: { patientUserId: true, startsAt: true, patient: { select: { displayName: true } } }, orderBy: { startsAt: 'desc' }, take: 500 }),
  ]);
  if (!organization) throw errors.notFound('Organization');
  const open = new Set(grants.map((g) => g.patientUserId));
  const others = new Map<string, { userId: string; name: string; lastVisit: Date }>();
  for (const a of recent) {
    if (!open.has(a.patientUserId) && !others.has(a.patientUserId)) others.set(a.patientUserId, { userId: a.patientUserId, name: a.patient.displayName ?? 'Patient', lastVisit: a.startsAt });
  }
  const view = (g: (typeof grants)[number]) => ({ grantId: g.id, userId: g.patientUserId, name: g.patient.displayName ?? 'Patient', canWrite: g.canWrite, expiresAt: g.expiresAt, since: g.grantedAt ?? g.createdAt });
  return {
    organization,
    active: grants.filter((g) => g.status === 'ACTIVE' && (!g.expiresAt || g.expiresAt > now)).map(view),
    requested: grants.filter((g) => g.status === 'REQUESTED').map(view),
    others: [...others.values()].slice(0, 100),
  };
}

export const requestSchema = z.object({ note: z.string().trim().max(300).optional() });

/** A practice asks a patient it has seen to share their record. */
export async function requestAccess(principal: Principal, organizationId: string, patientUserId: string, raw: z.input<typeof requestSchema>, context: Context = {}) {
  const me = signedIn(principal);
  const input = parse(requestSchema, raw);
  if (!can(me, READ, { organizationId })) throw errors.notFound('Patient');
  if ((await db().appointment.count({ where: { organizationId, patientUserId } })) === 0) throw errors.notFound('Patient');
  const id = newId('accessGrant');
  try {
    await db().recordAccessGrant.create({ data: { id, patientUserId, organizationId, status: 'REQUESTED', requestedByUserId: me.userId, requestNote: input.note || null, openKey: `${patientUserId}:${organizationId}` } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('This patient has already been asked, or has already shared their record with you.');
    throw error;
  }
  await recordAuditEvent({ action: 'RECORD_ACCESS_REQUESTED', actor: me.userId, subject: patientUserId, organizationId, outcome: 'success', requestId: context.requestId, detail: { grantId: id } });
  await notifyUser({ userId: patientUserId, notificationId: 'TL-NOTIF-RECORD-ACCESS-REQUEST-001', data: { practice: await practiceName(organizationId) }, linkUrl: '/account/records', requestId: context.requestId });
  return { grantId: id };
}

/** The record, for a practice under an active grant. Every call is an audited view. */
export async function practiceRecord(principal: Principal, organizationId: string, patientUserId: string, context: Context = {}) {
  const me = signedIn(principal);
  const grant = await activeGrantFor(me, organizationId, patientUserId);
  if (!grant) throw errors.notFound('Record');
  const [patient, dependents, record, dentist, appointments, organization] = await Promise.all([
    db().user.findUnique({ where: { id: patientUserId }, select: { id: true, displayName: true } }),
    db().dependent.findMany({ where: { guardianUserId: patientUserId, deletedAt: null }, select: { id: true, name: true, relationship: true, birthYear: true } }),
    loadRecord(patientUserId),
    verifiedDentist(me.userId),
    db().appointment.findMany({ where: { organizationId, patientUserId }, select: { id: true, serviceName: true, startsAt: true }, orderBy: { startsAt: 'desc' }, take: 20 }),
    db().organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } }),
  ]);
  await recordAuditEvent({ action: 'RECORD_VIEWED', actor: me.userId, subject: patientUserId, organizationId, outcome: 'success', requestId: context.requestId });
  const canWrite = grant.canWrite && can(me, WRITE, { organizationId });
  return {
    organization,
    patient,
    dependents,
    ...record,
    appointments,
    grant: { canWrite: grant.canWrite, grantedAt: grant.grantedAt, expiresAt: grant.expiresAt },
    canWrite,
    canPrescribe: canWrite && can(me, PRESCRIBE, { organizationId }) && Boolean(dentist),
    isVerifiedDentist: Boolean(dentist),
  };
}

/** A practice may add to this patient's record: an active read-and-add grant and the write permission. */
export async function writeAccess(me: AuthenticatedPrincipal, organizationId: string, patientUserId: string) {
  const grant = await activeGrantFor(me, organizationId, patientUserId);
  if (!grant) throw errors.notFound('Record');
  if (!grant.canWrite) throw errors.preconditionFailed('The patient has let you read their record, not add to it.');
  if (!can(me, WRITE, { organizationId })) throw errors.forbidden(WRITE);
  return grant;
}

export async function addPracticeEntry(principal: Principal, organizationId: string, patientUserId: string, raw: z.input<typeof entrySchema>, file?: UploadedBytes, context: Context = {}) {
  const me = signedIn(principal);
  await writeAccess(me, organizationId, patientUserId);
  const entryId = await createEntry(me, patientUserId, organizationId, raw, file, context);
  await recordAuditEvent({ action: 'RECORD_ENTRY_ADDED', actor: me.userId, subject: patientUserId, organizationId, outcome: 'success', requestId: context.requestId, detail: { entryId } });
  await notifyUser({ userId: patientUserId, notificationId: 'TL-NOTIF-RECORD-UPDATED-001', data: { practice: await practiceName(organizationId), change: 'added to your dental record' }, linkUrl: '/account/records', requestId: context.requestId });
  return { entryId };
}

export const retractSchema = z.object({ reason: z.string().trim().min(5, 'Say why, in a few words.').max(300) });

/** A practice withdraws its own entry; it stays visible, marked, with the reason. */
export async function retractEntry(principal: Principal, organizationId: string, entryId: string, raw: z.input<typeof retractSchema>, context: Context = {}) {
  const me = signedIn(principal);
  const input = parse(retractSchema, raw);
  if (!can(me, WRITE, { organizationId })) throw errors.notFound('Record entry');
  const entry = await db().recordEntry.findFirst({ where: { id: entryId, organizationId, retractedAt: null, deletedAt: null }, select: { id: true, patientUserId: true } });
  if (!entry) throw errors.notFound('Record entry');
  const moved = await db().recordEntry.updateMany({ where: { id: entry.id, retractedAt: null }, data: { retractedAt: context.now ?? new Date(), retractedReason: input.reason } });
  if (moved.count === 0) throw errors.notFound('Record entry');
  await recordAuditEvent({ action: 'RECORD_ENTRY_RETRACTED', actor: me.userId, subject: entry.patientUserId, organizationId, outcome: 'success', requestId: context.requestId, detail: { entryId } });
  return { retracted: true };
}

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

export const rxItemSchema = z.object({
  medicine: z.string().trim().min(2, 'Name the medicine.').max(120),
  strength: z.string().trim().max(60).optional(),
  dose: z.string().trim().min(1, 'Say the dose.').max(60),
  frequency: z.string().trim().min(1, 'Say how often.').max(60),
  duration: z.string().trim().min(1, 'Say for how long.').max(60),
  instructions: z.string().trim().max(200).optional(),
});
export type RxItem = z.infer<typeof rxItemSchema>;

export const prescriptionSchema = z.object({
  items: z.array(rxItemSchema).min(1, 'Add at least one medicine.').max(15),
  advice: z.string().trim().max(1000).optional(),
  dependentId: z.string().max(64).optional(),
  appointmentId: z.string().max(64).optional(),
});

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no 0/O or 1/I
/** 16 symbols × 5 bits = 80 random bits; 256 is a multiple of 32, so unbiased. */
export function newVerifyCode(): string {
  return Array.from(randomBytes(16), (b) => CODE_ALPHABET[b % 32]).join('');
}

export async function issuePrescription(principal: Principal, organizationId: string, patientUserId: string, raw: z.input<typeof prescriptionSchema>, context: Context = {}) {
  const me = signedIn(principal);
  const input = parse(prescriptionSchema, raw);
  const now = context.now ?? new Date();
  await writeAccess(me, organizationId, patientUserId);
  if (!can(me, PRESCRIBE, { organizationId })) throw errors.forbidden(PRESCRIBE);
  const dentist = await verifiedDentist(me.userId);
  if (!dentist) throw errors.preconditionFailed('Only a dentist whose credentials Toothlogy has verified can issue a prescription.');
  const dependentId = await checkDependent(patientUserId, input.dependentId);
  if (input.appointmentId && !(await db().appointment.count({ where: { id: input.appointmentId, patientUserId, organizationId } }))) {
    throw errors.validation('That appointment is not this patient’s at your practice.', { field: 'appointmentId' });
  }
  const id = newId('prescription');
  await db().prescription.create({
    data: { id, patientUserId, dependentId, organizationId, prescriberUserId: me.userId, dentistProfileId: dentist.id, appointmentId: input.appointmentId ?? null, items: input.items as unknown as Prisma.InputJsonValue, advice: input.advice || null, verifyCode: newVerifyCode(), issuedAt: now },
  });
  await recordAuditEvent({ action: 'PRESCRIPTION_ISSUED', actor: me.userId, subject: patientUserId, organizationId, outcome: 'success', requestId: context.requestId, detail: { prescriptionId: id, items: input.items.length } });
  await notifyUser({ userId: patientUserId, notificationId: 'TL-NOTIF-PRESCRIPTION-ISSUED-001', data: { practice: await practiceName(organizationId) }, linkUrl: `/prescriptions/${id}`, requestId: context.requestId });
  return { prescriptionId: id };
}

export async function cancelPrescription(principal: Principal, prescriptionId: string, raw: z.input<typeof retractSchema>, context: Context = {}) {
  const me = signedIn(principal);
  const input = parse(retractSchema, raw);
  const rx = await db().prescription.findUnique({ where: { id: prescriptionId }, select: { id: true, organizationId: true, patientUserId: true, prescriberUserId: true } });
  if (!rx || !can(me, PRESCRIBE, { organizationId: rx.organizationId })) throw errors.notFound('Prescription');
  const moved = await db().prescription.updateMany({ where: { id: rx.id, status: 'ISSUED' }, data: { status: 'CANCELLED', cancelledAt: context.now ?? new Date(), cancelledReason: input.reason } });
  if (moved.count === 0) throw errors.conflict('This prescription is already cancelled.');
  await recordAuditEvent({ action: 'PRESCRIPTION_CANCELLED', actor: me.userId, subject: rx.patientUserId, organizationId: rx.organizationId, outcome: 'success', requestId: context.requestId, detail: { prescriptionId: rx.id } });
  await notifyUser({ userId: rx.patientUserId, notificationId: 'TL-NOTIF-RECORD-UPDATED-001', data: { practice: await practiceName(rx.organizationId), change: 'cancelled a prescription' }, linkUrl: `/prescriptions/${rx.id}`, requestId: context.requestId });
  return { status: 'CANCELLED' };
}

const rxInclude = {
  organization: { select: { id: true, name: true } },
  prescriber: { select: { displayName: true } },
  dentistProfile: { select: { isVerified: true } },
  patient: { select: { displayName: true } },
  dependent: { select: { name: true, relationship: true, birthYear: true } },
} satisfies Prisma.PrescriptionInclude;

/** For the patient, or the issuing practice's members who may read records. */
export async function getPrescription(principal: Principal, prescriptionId: string) {
  const me = signedIn(principal);
  const rx = await db().prescription.findUnique({ where: { id: prescriptionId }, include: rxInclude });
  if (!rx) throw errors.notFound('Prescription');
  const isPatient = rx.patientUserId === me.userId;
  const isPractice = can(me, READ, { organizationId: rx.organizationId });
  if (!isPatient && !isPractice) throw errors.notFound('Prescription');
  return {
    prescription: { ...rx, items: rx.items as unknown as RxItem[] },
    side: isPatient ? ('PATIENT' as const) : ('PRACTICE' as const),
    canCancel: rx.status === 'ISSUED' && !isPatient && can(me, PRESCRIBE, { organizationId: rx.organizationId }),
  };
}

/** "Asha Wadhwa" → "Asha W." — enough for a pharmacist to match, no more. */
export function firstNameAndInitial(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Patient';
  return parts.length === 1 ? parts[0]! : `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** The public check behind the QR code. Null for an unknown code. */
export async function verifyPrescription(code: string) {
  if (!/^[A-Z2-9]{16}$/.test(code)) return null;
  const rx = await db().prescription.findUnique({ where: { verifyCode: code }, include: rxInclude });
  if (!rx) return null;
  return {
    status: rx.status,
    issuedAt: rx.issuedAt,
    cancelledAt: rx.cancelledAt,
    prescriber: rx.prescriber.displayName ?? 'Dentist',
    verifiedDentist: rx.dentistProfile.isVerified,
    practice: rx.organization.name,
    patient: firstNameAndInitial(rx.dependent?.name ?? rx.patient.displayName),
    items: rx.items as unknown as RxItem[],
  };
}
