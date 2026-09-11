/**
 * TOOTHLOGY CAMPS — district dental awareness camps
 *
 * ORGANIZER → DISTRICT → CAMP → SUBMIT → STAFF APPROVAL → DOCTORS APPLY →
 * ORGANIZER APPROVES → PATIENTS REGISTER → VISIT → REFERRAL → LEAD → APPOINTMENT
 *
 * - A camp is organized by a person (a dentist, a clinic administrator, a
 *   camp organizer, or staff) in one district, optionally for a clinic,
 *   hospital or college they manage. It is public only once staff approve
 *   it, and nobody reviews their own camp.
 * - Verified dentists apply to serve; the organizer approves or declines;
 *   attendance is recorded afterwards — the dentist's participation history.
 * - Patients register themselves (signed in) or are recorded at the venue.
 *   Capacity is enforced under a row lock; a phone number, and an account,
 *   registers once per camp. Consent covers sharing with the camp's
 *   organizer and doctors, nothing more.
 * - A visit may refer the patient to one of the camp's doctors. Leads and
 *   appointments that follow go through the ordinary callback and booking
 *   flows — same qualification, same pricing — and are attributed to the
 *   camp visit (`campReferralFor`). A walk-in without an account cannot
 *   become a platform lead; the referral is kept for the camp's doctors.
 */

import { z } from 'zod';
import { Prisma, type CampStatus } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyUser } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { normalizeIndianMobile, slugify } from '../india-data/normalize';

export const ORGANIZE = 'tl.camps.camp.organize';
export const APPROVE = 'tl.camps.camp.approve';
const DAY = 86_400_000;
/** How long after a camp a booking with the referred dentist still counts as the camp's. */
export const ATTRIBUTION_DAYS = 90;

type Tx = Prisma.TransactionClient;

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return principal;
}

async function loadCamp(campId: string) {
  const camp = await db().camp.findUnique({ where: { id: campId } });
  if (!camp) throw errors.notFound('Camp');
  return camp;
}

async function verifiedProfileOf(userId: string, now: Date) {
  const profile = await db().dentistProfile.findUnique({ where: { userId }, select: { id: true, isVerified: true, verificationExpiresAt: true, deletedAt: true } });
  if (!profile || profile.deletedAt || !profile.isVerified || (profile.verificationExpiresAt && profile.verificationExpiresAt <= now)) return null;
  return profile;
}

/** Is this user an approved doctor at this camp? Returns their profile id. */
async function campDoctorProfile(campId: string, userId: string): Promise<string | null> {
  const row = await db().campDoctor.findFirst({ where: { campId, status: 'APPROVED', dentistProfile: { userId } }, select: { dentistProfileId: true } });
  return row?.dentistProfileId ?? null;
}

// ---------------------------------------------------------------------------
// Camps
// ---------------------------------------------------------------------------

const when = z.string().datetime({ offset: true });
const text = (max: number) => z.string().trim().max(max).nullable().optional();

const campFields = {
  title: z.string().trim().min(5, 'Give the camp a title.').max(160),
  districtId: z.string().max(64),
  organizationId: z.string().max(64).nullable().optional(),
  venueName: z.string().trim().min(3, 'Name the venue.').max(160),
  venueAddress: z.string().trim().min(5, 'Give the venue’s address.').max(400),
  startsAt: when,
  endsAt: when,
  capacity: z.number().int().min(1).max(5000).nullable().optional(),
  description: text(4000),
  services: text(500),
};
export const campSchema = z.object(campFields);
export const campUpdateSchema = z.object(campFields).partial();

function checkTimes(startsAt: Date, endsAt: Date, now: Date) {
  if (endsAt <= startsAt) throw errors.validation('The camp must end after it starts.', { field: 'endsAt' });
  if (endsAt.getTime() - startsAt.getTime() > 3 * DAY) throw errors.validation('A camp lasts at most three days; plan longer programmes as several camps.', { field: 'endsAt' });
  if (startsAt.getTime() < now.getTime()) throw errors.validation('Choose a start in the future.', { field: 'startsAt' });
}

async function checkOrganization(principal: AuthenticatedPrincipal, organizationId: string | null | undefined) {
  if (!organizationId) return;
  if (!can(principal, 'tl.core.organization.manage', { organizationId })) throw errors.validation('You can only run a camp for an organization you manage.', { field: 'organizationId' });
}

export async function createCamp(principal: Principal, raw: z.input<typeof campSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  if (!can(me, ORGANIZE)) throw errors.forbidden(ORGANIZE);
  const input = campSchema.parse(raw);
  const now = context.now ?? new Date();
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  checkTimes(startsAt, endsAt, now);
  const district = await db().district.findUnique({ where: { id: input.districtId }, select: { slug: true } });
  if (!district) throw errors.validation('That district does not exist.', { field: 'districtId' });
  await checkOrganization(me, input.organizationId);
  const id = newId('camp');
  const slug = `${slugify(input.title).slice(0, 60) || 'camp'}-${district.slug}-${startsAt.toISOString().slice(0, 10)}-${id.slice(-5).toLowerCase()}`;
  await db().camp.create({
    data: {
      id,
      slug,
      title: input.title,
      description: input.description ?? null,
      services: input.services ?? null,
      districtId: input.districtId,
      organizerUserId: me.userId,
      organizationId: input.organizationId ?? null,
      venueName: input.venueName,
      venueAddress: input.venueAddress,
      startsAt,
      endsAt,
      capacity: input.capacity ?? null,
    },
  });
  await recordAuditEvent({ action: 'CAMP_CREATED', actor: me.userId, subject: id, outcome: 'success', requestId: context.requestId });
  return { campId: id, slug };
}

export async function updateCamp(principal: Principal, campId: string, raw: z.input<typeof campUpdateSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const camp = await loadCamp(campId);
  if (camp.organizerUserId !== me.userId) throw errors.notFound('Camp');
  if (camp.status !== 'DRAFT' && camp.status !== 'REJECTED') throw errors.preconditionFailed('Only a draft or a rejected camp can be changed. Cancel and create a new one if plans changed after approval.');
  const input = campUpdateSchema.parse(raw);
  const now = context.now ?? new Date();
  const startsAt = input.startsAt ? new Date(input.startsAt) : camp.startsAt;
  const endsAt = input.endsAt ? new Date(input.endsAt) : camp.endsAt;
  checkTimes(startsAt, endsAt, now);
  if (input.districtId && !(await db().district.findUnique({ where: { id: input.districtId }, select: { id: true } }))) throw errors.validation('That district does not exist.', { field: 'districtId' });
  if (input.organizationId !== undefined) await checkOrganization(me, input.organizationId);
  const claim = await db().camp.updateMany({
    where: { id: campId, status: camp.status },
    data: { ...input, startsAt, endsAt, status: 'DRAFT' },
  });
  if (claim.count === 0) throw errors.conflict('This camp changed while you were editing it.');
  await recordAuditEvent({ action: 'CAMP_UPDATED', actor: me.userId, subject: campId, outcome: 'success', requestId: context.requestId });
}

export const campActionSchema = z.object({
  action: z.enum(['SUBMIT', 'APPROVE', 'REJECT', 'CANCEL', 'COMPLETE']),
  note: z.string().trim().max(1000).optional(),
});

export async function actOnCamp(principal: Principal, campId: string, raw: z.input<typeof campActionSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = campActionSchema.parse(raw);
  const now = context.now ?? new Date();
  const camp = await loadCamp(campId);
  const organizer = camp.organizerUserId === me.userId;
  const approver = can(me, APPROVE);
  let from: CampStatus[];
  let to: CampStatus;
  let data: Prisma.CampUpdateManyMutationInput = {};

  switch (input.action) {
    case 'SUBMIT':
      if (!organizer) throw errors.notFound('Camp');
      if (camp.startsAt <= now) throw errors.preconditionFailed('This camp’s start has passed. Change the dates first.');
      from = ['DRAFT', 'REJECTED'];
      to = 'SUBMITTED';
      data = { submittedAt: now, reviewNote: null, reviewedAt: null, reviewedByUserId: null };
      break;
    case 'APPROVE':
    case 'REJECT':
      if (!approver) throw organizer ? errors.forbidden(APPROVE) : errors.notFound('Camp');
      if (organizer) throw errors.forbidden(APPROVE); // nobody reviews their own camp
      if (input.action === 'REJECT' && !input.note) throw errors.validation('Say why, so the organizer can fix it.', { field: 'note' });
      if (input.action === 'APPROVE' && camp.startsAt <= now) throw errors.preconditionFailed('This camp’s start has passed.');
      from = ['SUBMITTED'];
      to = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      data = { reviewedByUserId: me.userId, reviewedAt: now, reviewNote: input.note ?? null };
      break;
    case 'CANCEL':
      if (!organizer && !approver) throw errors.notFound('Camp');
      if (camp.endsAt <= now) throw errors.preconditionFailed('This camp has already ended.');
      if (camp.status === 'APPROVED' && !input.note) throw errors.validation('Say why: the registered patients and doctors are told.', { field: 'note' });
      from = ['DRAFT', 'SUBMITTED', 'APPROVED'];
      to = 'CANCELLED';
      data = { cancelledAt: now, reviewNote: input.note ?? camp.reviewNote };
      break;
    case 'COMPLETE':
      if (!organizer && !approver) throw errors.notFound('Camp');
      if (camp.startsAt > now) throw errors.preconditionFailed('A camp can be completed once it has started.');
      from = ['APPROVED'];
      to = 'COMPLETED';
      data = { completedAt: now };
      break;
  }

  if (!from.includes(camp.status)) throw errors.preconditionFailed(`A ${camp.status.toLowerCase()} camp cannot be ${input.action === 'SUBMIT' ? 'submitted' : `${input.action.toLowerCase()}d`.replace('ed' + 'd', 'ed')}.`);
  await transaction(async (tx) => {
    const claim = await tx.camp.updateMany({ where: { id: campId, status: camp.status }, data: { ...data, status: to } });
    if (claim.count === 0) throw errors.conflict('This camp changed while you were acting on it.');
    if (to === 'COMPLETED') {
      // Whoever was registered and never checked in did not come.
      await tx.campRegistration.updateMany({ where: { campId, status: 'REGISTERED' }, data: { status: 'NO_SHOW' } });
    }
  });
  await recordAuditEvent({ action: `CAMP_${input.action}`, actor: me.userId, subject: campId, outcome: 'success', requestId: context.requestId, detail: { note: input.note ?? null } });

  if (to === 'APPROVED' || to === 'REJECTED') {
    await notifyUser({ userId: camp.organizerUserId, notificationId: 'TL-NOTIF-CAMP-REVIEW-001', data: { summary: to === 'APPROVED' ? `“${camp.title}” was approved and is now public.` : `“${camp.title}” was not approved: ${input.note}` }, linkUrl: `/account/camps/${campId}` });
  }
  if (to === 'CANCELLED' && camp.status === 'APPROVED') {
    const [patients, doctors] = await Promise.all([
      db().campRegistration.findMany({ where: { campId, status: 'REGISTERED', patientUserId: { not: null } }, select: { patientUserId: true } }),
      db().campDoctor.findMany({ where: { campId, status: { in: ['APPLIED', 'APPROVED'] } }, select: { dentistProfile: { select: { userId: true } } } }),
    ]);
    const summary = `“${camp.title}” on ${camp.startsAt.toISOString().slice(0, 10)} was cancelled: ${input.note}`;
    for (const p of patients) await notifyUser({ userId: p.patientUserId!, notificationId: 'TL-NOTIF-CAMP-UPDATE-001', data: { summary }, linkUrl: '/account/camps' });
    for (const d of doctors) await notifyUser({ userId: d.dentistProfile.userId, notificationId: 'TL-NOTIF-CAMP-PARTICIPATION-001', data: { summary }, linkUrl: '/account/camps' });
  }
  return { status: to };
}

// ---------------------------------------------------------------------------
// Doctors
// ---------------------------------------------------------------------------

export const applySchema = z.object({ message: z.string().trim().max(1000).optional() });

export async function applyToCamp(principal: Principal, campId: string, raw: z.input<typeof applySchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = applySchema.parse(raw);
  const now = context.now ?? new Date();
  const profile = await verifiedProfileOf(me.userId, now);
  if (!profile) throw errors.preconditionFailed('Only verified dentists can serve at camps. Complete your verification first.');
  const camp = await loadCamp(campId);
  if (!['SUBMITTED', 'APPROVED'].includes(camp.status) || camp.endsAt <= now) throw errors.preconditionFailed('This camp is not taking doctors.');

  const existing = await db().campDoctor.findUnique({ where: { campId_dentistProfileId: { campId, dentistProfileId: profile.id } } });
  let id: string;
  if (existing) {
    if (existing.status !== 'WITHDRAWN') throw errors.conflict(existing.status === 'DECLINED' ? 'The organizer declined your application for this camp.' : 'You have already applied to this camp.');
    const reopened = await db().campDoctor.updateMany({ where: { id: existing.id, status: 'WITHDRAWN' }, data: { status: 'APPLIED', message: input.message ?? null, appliedAt: now, decidedAt: null, decidedByUserId: null, decisionNote: null } });
    if (reopened.count === 0) throw errors.conflict('Your application changed a moment ago.');
    id = existing.id;
  } else {
    id = newId('campDoctor');
    try {
      await db().campDoctor.create({ data: { id, campId, dentistProfileId: profile.id, message: input.message ?? null, appliedAt: now } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('You have already applied to this camp.');
      throw error;
    }
  }
  await recordAuditEvent({ action: 'CAMP_DOCTOR_APPLIED', actor: me.userId, subject: id, outcome: 'success', requestId: context.requestId, detail: { campId } });
  if (camp.organizerUserId !== me.userId) {
    await notifyUser({ userId: camp.organizerUserId, notificationId: 'TL-NOTIF-CAMP-APPLICATION-001', data: { summary: `A verified dentist applied to serve at “${camp.title}”.` }, linkUrl: `/account/camps/${campId}` });
  }
  return { campDoctorId: id };
}

export const doctorActionSchema = z.object({ action: z.enum(['APPROVE', 'DECLINE', 'WITHDRAW', 'ATTENDED', 'ABSENT']), note: z.string().trim().max(500).optional() });

export async function actOnCampDoctor(principal: Principal, campDoctorId: string, raw: z.input<typeof doctorActionSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = doctorActionSchema.parse(raw);
  const now = context.now ?? new Date();
  const row = await db().campDoctor.findUnique({ where: { id: campDoctorId }, include: { camp: true, dentistProfile: { select: { userId: true } } } });
  if (!row) throw errors.notFound('Application');
  const isDoctor = row.dentistProfile.userId === me.userId;
  const runs = row.camp.organizerUserId === me.userId || can(me, APPROVE);

  if (input.action === 'WITHDRAW') {
    if (!isDoctor) throw errors.notFound('Application');
    if (row.camp.startsAt <= now) throw errors.preconditionFailed('The camp has started; tell the organizer instead.');
    const done = await db().campDoctor.updateMany({ where: { id: campDoctorId, status: { in: ['APPLIED', 'APPROVED'] } }, data: { status: 'WITHDRAWN' } });
    if (done.count === 0) throw errors.preconditionFailed('There is nothing to withdraw.');
  } else {
    if (!runs) throw isDoctor ? errors.forbidden(ORGANIZE) : errors.notFound('Application');
    if (input.action === 'APPROVE' || input.action === 'DECLINE') {
      if (!['SUBMITTED', 'APPROVED'].includes(row.camp.status) || row.camp.endsAt <= now) throw errors.preconditionFailed('This camp is not taking doctors.');
      const done = await db().campDoctor.updateMany({
        where: { id: campDoctorId, status: 'APPLIED' },
        data: { status: input.action === 'APPROVE' ? 'APPROVED' : 'DECLINED', decidedAt: now, decidedByUserId: me.userId, decisionNote: input.note ?? null },
      });
      if (done.count === 0) throw errors.preconditionFailed('Only a pending application can be decided.');
      await notifyUser({
        userId: row.dentistProfile.userId,
        notificationId: 'TL-NOTIF-CAMP-PARTICIPATION-001',
        data: { summary: input.action === 'APPROVE' ? `You are confirmed to serve at “${row.camp.title}”.` : `Your application to serve at “${row.camp.title}” was declined${input.note ? `: ${input.note}` : '.'}` },
        linkUrl: '/account/camps',
      });
    } else {
      if (row.camp.startsAt > now) throw errors.preconditionFailed('Attendance is recorded once the camp has started.');
      const done = await db().campDoctor.updateMany({ where: { id: campDoctorId, status: 'APPROVED' }, data: { attended: input.action === 'ATTENDED' } });
      if (done.count === 0) throw errors.preconditionFailed('Only a confirmed doctor’s attendance is recorded.');
    }
  }
  await recordAuditEvent({ action: `CAMP_DOCTOR_${input.action}`, actor: me.userId, subject: campDoctorId, outcome: 'success', requestId: context.requestId, detail: { campId: row.campId } });
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export const selfRegistrationSchema = z.object({
  phone: z.string().trim().max(24).optional(),
  age: z.number().int().min(0).max(120).optional(),
  concern: z.string().trim().max(500).optional(),
  consentToShare: z.literal(true, { error: 'Agree to share your details with the camp’s organizer and doctors to register.' }),
});
export const walkInSchema = selfRegistrationSchema.extend({
  name: z.string().trim().min(2, 'Enter the patient’s name.').max(120),
  phone: z.string().trim().max(24),
});

async function insertRegistration(tx: Tx, camp: { id: string; capacity: number | null }, data: Omit<Prisma.CampRegistrationUncheckedCreateInput, 'campId'>) {
  // One writer per camp at a time, so the last seat is given once.
  await tx.$queryRaw`SELECT "id" FROM "camps" WHERE "id" = ${camp.id} FOR UPDATE`;
  if (camp.capacity !== null) {
    const taken = await tx.campRegistration.count({ where: { campId: camp.id, status: { in: ['REGISTERED', 'ATTENDED'] } } });
    if (taken >= camp.capacity) throw errors.preconditionFailed('This camp is full.');
  }
  await tx.campRegistration.create({ data: { ...data, campId: camp.id } });
}

function duplicateRegistration(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('This phone number or account is already registered for this camp.');
  throw error;
}

export async function registerForCamp(principal: Principal, campId: string, raw: z.input<typeof selfRegistrationSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = selfRegistrationSchema.parse(raw);
  const now = context.now ?? new Date();
  const user = await db().user.findUnique({ where: { id: me.userId }, select: { displayName: true, phone: true, status: true } });
  if (!user || user.status !== 'ACTIVE') throw errors.unauthenticated();
  const phone = normalizeIndianMobile(input.phone ?? user.phone);
  if (!phone) throw errors.validation('Enter a 10-digit Indian mobile number, so the camp can reach you.', { field: 'phone' });
  const camp = await loadCamp(campId);
  if (camp.status !== 'APPROVED' || camp.endsAt <= now) throw errors.preconditionFailed('This camp is not taking registrations.');
  const id = newId('campRegistration');
  try {
    await transaction((tx) =>
      insertRegistration(tx, camp, { id, patientUserId: me.userId, source: 'SELF', registeredByUserId: me.userId, name: user.displayName ?? 'Patient', phone, age: input.age ?? null, concern: input.concern ?? null, consentToShare: true }),
    );
  } catch (error) {
    duplicateRegistration(error);
  }
  await recordAuditEvent({ action: 'CAMP_REGISTERED', actor: me.userId, subject: id, outcome: 'success', requestId: context.requestId, detail: { campId } });
  await notifyUser({ userId: me.userId, notificationId: 'TL-NOTIF-CAMP-UPDATE-001', data: { summary: `You are registered for “${camp.title}” at ${camp.venueName}.` }, linkUrl: '/account/camps' });
  return { registrationId: id };
}

export async function registerWalkIn(principal: Principal, campId: string, raw: z.input<typeof walkInSchema>, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const input = walkInSchema.parse(raw);
  const camp = await loadCamp(campId);
  const runs = camp.organizerUserId === me.userId || can(me, APPROVE) || (await campDoctorProfile(campId, me.userId)) !== null;
  if (!runs) throw errors.notFound('Camp');
  if (camp.status !== 'APPROVED') throw errors.preconditionFailed('Patients are recorded at an approved camp that has not been completed.');
  const phone = normalizeIndianMobile(input.phone);
  if (!phone) throw errors.validation('Enter a 10-digit Indian mobile number.', { field: 'phone' });
  const id = newId('campRegistration');
  try {
    await transaction((tx) => insertRegistration(tx, camp, { id, patientUserId: null, source: 'WALK_IN', registeredByUserId: me.userId, name: input.name, phone, age: input.age ?? null, concern: input.concern ?? null, consentToShare: true }));
  } catch (error) {
    duplicateRegistration(error);
  }
  await recordAuditEvent({ action: 'CAMP_WALK_IN_REGISTERED', actor: me.userId, subject: id, outcome: 'success', requestId: context.requestId, detail: { campId } });
  return { registrationId: id };
}

export async function cancelRegistration(principal: Principal, registrationId: string, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const now = context.now ?? new Date();
  const row = await db().campRegistration.findUnique({ where: { id: registrationId }, include: { camp: { select: { startsAt: true } } } });
  if (!row || row.patientUserId !== me.userId) throw errors.notFound('Registration');
  if (row.camp.startsAt <= now) throw errors.preconditionFailed('The camp has started.');
  const done = await db().campRegistration.updateMany({ where: { id: registrationId, status: 'REGISTERED' }, data: { status: 'CANCELLED', cancelledAt: now } });
  if (done.count === 0) throw errors.preconditionFailed('There is nothing to cancel.');
  await recordAuditEvent({ action: 'CAMP_REGISTRATION_CANCELLED', actor: me.userId, subject: registrationId, outcome: 'success', requestId: context.requestId });
}

export const visitSchema = z.object({
  findings: z.string().trim().max(2000).optional(),
  needsFollowUp: z.boolean().default(false),
  referredDentistProfileId: z.string().max(64).nullable().optional(),
});

/** The organizer or a camp doctor records the visit: attended, findings, referral. */
export async function recordVisit(principal: Principal, registrationId: string, raw: z.input<typeof visitSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = visitSchema.parse(raw);
  const now = context.now ?? new Date();
  const row = await db().campRegistration.findUnique({ where: { id: registrationId }, include: { camp: true } });
  if (!row) throw errors.notFound('Registration');
  const doctorProfileId = await campDoctorProfile(row.campId, me.userId);
  if (row.camp.organizerUserId !== me.userId && !can(me, APPROVE) && !doctorProfileId) throw errors.notFound('Registration');
  if (!['APPROVED', 'COMPLETED'].includes(row.camp.status) || row.camp.startsAt > now) throw errors.preconditionFailed('Visits are recorded once the camp has started.');
  if (row.status === 'CANCELLED') throw errors.preconditionFailed('This registration was cancelled.');
  if (input.referredDentistProfileId) {
    const approved = await db().campDoctor.count({ where: { campId: row.campId, dentistProfileId: input.referredDentistProfileId, status: 'APPROVED' } });
    if (approved === 0) throw errors.validation('Refer only to a doctor serving at this camp.', { field: 'referredDentistProfileId' });
  }
  if (input.referredDentistProfileId && !input.needsFollowUp) throw errors.validation('A referral means the patient needs follow-up.', { field: 'needsFollowUp' });
  await db().campRegistration.update({
    where: { id: registrationId },
    data: {
      status: 'ATTENDED',
      checkedInAt: row.checkedInAt ?? now,
      findings: input.findings ?? row.findings,
      needsFollowUp: input.needsFollowUp,
      referredDentistProfileId: input.referredDentistProfileId ?? null,
      seenByDentistProfileId: doctorProfileId ?? row.seenByDentistProfileId,
    },
  });
  await recordAuditEvent({ action: 'CAMP_VISIT_RECORDED', actor: me.userId, subject: registrationId, outcome: 'success', requestId: context.requestId, detail: { needsFollowUp: input.needsFollowUp, referred: Boolean(input.referredDentistProfileId) } });
  if (row.patientUserId && input.referredDentistProfileId && input.referredDentistProfileId !== row.referredDentistProfileId) {
    await notifyUser({ userId: row.patientUserId, notificationId: 'TL-NOTIF-CAMP-UPDATE-001', data: { summary: `After “${row.camp.title}”, a camp doctor can see you for follow-up. Book or ask them to call you from My camps.` }, linkUrl: '/account/camps' });
  }
}

/**
 * The camp visit a booking or callback with this dentist follows from: the
 * patient attended, was referred to this dentist, and the camp ended no more
 * than ATTRIBUTION_DAYS ago. Attribution only — it never changes a price.
 */
export async function campReferralFor(patientUserId: string, dentistProfileId: string, now: Date = new Date()): Promise<string | null> {
  const row = await db().campRegistration.findFirst({
    where: { patientUserId, referredDentistProfileId: dentistProfileId, status: 'ATTENDED', needsFollowUp: true, camp: { endsAt: { gte: new Date(now.getTime() - ATTRIBUTION_DAYS * DAY) }, startsAt: { lte: now } } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const PUBLIC_DOCTOR = { where: { status: 'APPROVED' as const }, select: { dentistProfile: { select: { id: true, slug: true, isDiscoverable: true, user: { select: { displayName: true } } } } } };

export async function listPublicCamps(filter: { districtId?: string; regionId?: string } = {}, now: Date = new Date()) {
  return db().camp.findMany({
    where: {
      status: 'APPROVED',
      endsAt: { gte: now },
      ...(filter.districtId ? { districtId: filter.districtId } : {}),
      ...(filter.regionId ? { district: { regionId: filter.regionId } } : {}),
    },
    include: { district: { select: { name: true, region: { select: { name: true } } } }, organization: { select: { name: true } }, _count: { select: { doctors: { where: { status: 'APPROVED' } }, registrations: { where: { status: { in: ['REGISTERED', 'ATTENDED'] } } } } } },
    orderBy: { startsAt: 'asc' },
    take: 200,
  });
}

export async function getPublicCamp(slug: string) {
  const camp = await db().camp.findFirst({
    where: { slug, status: { in: ['APPROVED', 'COMPLETED'] } },
    include: {
      district: { select: { name: true, region: { select: { name: true } } } },
      organization: { select: { name: true, slug: true } },
      organizer: { select: { displayName: true } },
      doctors: PUBLIC_DOCTOR,
      _count: { select: { registrations: { where: { status: { in: ['REGISTERED', 'ATTENDED'] } } } } },
    },
  });
  if (!camp) return null;
  const taken = camp._count.registrations;
  return { ...camp, seatsLeft: camp.capacity === null ? null : Math.max(0, camp.capacity - taken) };
}

/** The organizer's (or staff's, or a camp doctor's) working view of one camp. */
export async function campConsole(principal: Principal, campId: string) {
  const me = signedIn(principal);
  const camp = await loadCamp(campId);
  const doctorProfileId = await campDoctorProfile(campId, me.userId);
  const organizer = camp.organizerUserId === me.userId;
  if (!organizer && !can(me, APPROVE) && !doctorProfileId) throw errors.notFound('Camp');
  const [full, leads, appointments] = await Promise.all([
    db().camp.findUniqueOrThrow({
      where: { id: campId },
      include: {
        district: { select: { name: true, region: { select: { name: true } } } },
        organization: { select: { name: true } },
        doctors: { include: { dentistProfile: { select: { id: true, slug: true, isVerified: true, user: { select: { displayName: true } } } } }, orderBy: { appliedAt: 'asc' } },
        registrations: { include: { referredDentist: { select: { user: { select: { displayName: true } } } }, seenBy: { select: { user: { select: { displayName: true } } } } }, orderBy: { createdAt: 'asc' } },
      },
    }),
    db().lead.count({ where: { campRegistration: { campId } } }),
    db().appointment.count({ where: { campRegistration: { campId } } }),
  ]);
  const count = (s: string) => full.registrations.filter((r) => r.status === s).length;
  return {
    camp: full,
    viewer: { organizer, staff: can(me, APPROVE), doctorProfileId },
    stats: {
      registered: count('REGISTERED'),
      attended: count('ATTENDED'),
      noShow: count('NO_SHOW'),
      cancelled: count('CANCELLED'),
      walkIns: full.registrations.filter((r) => r.source === 'WALK_IN').length,
      followUps: full.registrations.filter((r) => r.needsFollowUp).length,
      referrals: full.registrations.filter((r) => r.referredDentistProfileId).length,
      leads,
      appointments,
    },
  };
}

/** Participation history: camps organized, served at, and attended. */
export async function myCamps(principal: Principal) {
  const me = signedIn(principal);
  const profile = await db().dentistProfile.findUnique({ where: { userId: me.userId }, select: { id: true } });
  const [organized, serving, registrations] = await Promise.all([
    db().camp.findMany({ where: { organizerUserId: me.userId }, include: { district: { select: { name: true } } }, orderBy: { startsAt: 'desc' }, take: 100 }),
    profile ? db().campDoctor.findMany({ where: { dentistProfileId: profile.id }, include: { camp: { include: { district: { select: { name: true } } } } }, orderBy: { appliedAt: 'desc' }, take: 100 }) : Promise.resolve([]),
    db().campRegistration.findMany({
      where: { patientUserId: me.userId },
      include: {
        camp: { include: { district: { select: { name: true } }, doctors: PUBLIC_DOCTOR } },
        referredDentist: { select: { id: true, slug: true, isDiscoverable: true, user: { select: { displayName: true } }, practices: { where: { isConfirmed: true }, select: { id: true }, take: 1 } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  return { organized, serving, registrations };
}

export async function campsForReview(principal: Principal) {
  const me = signedIn(principal);
  if (!can(me, APPROVE)) throw errors.forbidden(APPROVE);
  return db().camp.findMany({
    where: { status: { in: ['SUBMITTED', 'APPROVED', 'REJECTED'] } },
    include: { district: { select: { name: true, region: { select: { name: true } } } }, organizer: { select: { displayName: true, email: true } }, organization: { select: { name: true } }, _count: { select: { doctors: { where: { status: 'APPROVED' } }, registrations: true } } },
    orderBy: [{ status: 'desc' }, { startsAt: 'asc' }],
    take: 300,
  });
}
