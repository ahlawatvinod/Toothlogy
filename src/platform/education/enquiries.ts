/**
 * TOOTHLOGY EDUCATION — admission enquiries (a college's admission leads)
 *
 * STUDENT ENQUIRES → NEW → CONTACTED → APPLIED → ADMITTED | NOT ADMITTED
 *                        └──────────┴─────────→ LOST (college) | WITHDRAWN (student)
 *
 * - Only a signed-in person with a verified email, who agreed to be
 *   contacted, may enquire; about a published course of a claimed college;
 *   never at a college they work for.
 * - One open enquiry per student per course (a unique open key, cleared when
 *   the enquiry closes). A student may enquire again after it closes.
 * - The college sees the student's name, email and phone — the student gave
 *   consent for exactly that. Exam and rank are shown as the student's own.
 * - Enquiries are not billed.
 * - Each change is an event; the student hears of each decision, the college
 *   of each new enquiry — neither message carries the other's details.
 */

import { z } from 'zod';
import { Prisma, type AdmissionEnquiryStatus } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyOrganizationAdmins, notifyUser } from '../notifications';
import { can, isAuthenticated, type Principal } from '../rbac';
import { currentCycle, ENTRANCE_EXAMS } from './colleges';

const READ = 'tl.education.enquiry.read';
const MANAGE = 'tl.education.enquiry.manage';
const OPEN: AdmissionEnquiryStatus[] = ['NEW', 'CONTACTED', 'APPLIED'];
export const ENQUIRY_STATUS_LABEL: Record<AdmissionEnquiryStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  APPLIED: 'Applied',
  ADMITTED: 'Admitted',
  NOT_ADMITTED: 'Not admitted',
  WITHDRAWN: 'Withdrawn',
  LOST: 'Closed',
};

export const enquirySchema = z.object({
  message: z.string().trim().max(1000).optional(),
  qualification: z.string().trim().max(160).optional(),
  examName: z.enum(ENTRANCE_EXAMS).optional(),
  examRank: z.number().int().min(1).max(5_000_000).optional(),
  consentToContact: z.literal(true, { error: 'Agree to be contacted by the college to send your enquiry.' }),
});

export async function createEnquiry(principal: Principal, courseId: string, raw: z.input<typeof enquirySchema>, context: { requestId?: string } = {}) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const input = enquirySchema.parse(raw);
  const student = await db().user.findUnique({ where: { id: principal.userId }, select: { emailVerifiedAt: true, status: true } });
  if (!student || student.status !== 'ACTIVE') throw errors.unauthenticated();
  if (!student.emailVerifiedAt) throw errors.preconditionFailed('Verify your email address first, so the college can reply to you.');

  const course = await db().course.findFirst({
    where: { id: courseId, status: 'PUBLISHED', organization: { type: 'COLLEGE', deletedAt: null, status: { in: ['ACTIVE', 'PENDING'] }, ownerUserId: { not: null } } },
    select: { id: true, name: true, organizationId: true },
  });
  if (!course) throw errors.notFound('Course');
  const member = await db().organizationMember.count({ where: { organizationId: course.organizationId, userId: principal.userId, leftAt: null } });
  if (member > 0) throw errors.preconditionFailed('You work at this college, so you cannot enquire about its courses.');

  const cycle = await currentCycle(course.id);
  const id = newId('admissionEnquiry');
  try {
    await transaction(async (tx) => {
      await tx.admissionEnquiry.create({
        data: {
          id,
          organizationId: course.organizationId,
          courseId: course.id,
          cycleId: cycle?.id ?? null,
          studentUserId: principal.userId,
          message: input.message ?? null,
          qualification: input.qualification ?? null,
          examName: input.examName ?? null,
          examRank: input.examRank ?? null,
          consentToContact: true,
          openKey: `${principal.userId}:${course.id}`,
        },
      });
      await tx.admissionEnquiryEvent.create({ data: { id: newId('admissionEnquiryEvent'), enquiryId: id, action: 'CREATED', toStatus: 'NEW', actorUserId: principal.userId } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('You already have an open enquiry about this course.');
    throw error;
  }
  await recordAuditEvent({ action: 'ADMISSION_ENQUIRY_CREATED', actor: principal.userId, subject: id, outcome: 'success', organizationId: course.organizationId, requestId: context.requestId });
  await notifyOrganizationAdmins({
    organizationId: course.organizationId,
    notificationId: 'TL-NOTIF-ADMISSION-ENQUIRY-001',
    data: { summary: `New admission enquiry about ${course.name}.` },
    linkUrl: `/account/organizations/${course.organizationId}/admissions`,
  });
  return { enquiryId: id, cycle: cycle?.academicYear ?? null };
}

const when = z.string().datetime({ offset: true });
export const enquiryActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['CONTACTED', 'APPLIED', 'ADMITTED', 'NOT_ADMITTED', 'LOST', 'WITHDRAW']), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal('ASSIGN'), assigneeUserId: z.string().max(64).nullable() }),
  z.object({ action: z.literal('NOTE'), note: z.string().trim().min(2, 'Write a note.').max(1000) }),
  z.object({ action: z.literal('FOLLOW_UP'), at: when.nullable() }),
]);

const TRANSITIONS: Record<string, { from: AdmissionEnquiryStatus[]; to: AdmissionEnquiryStatus; stamp?: 'contactedAt' | 'appliedAt' | 'decidedAt' }> = {
  CONTACTED: { from: ['NEW'], to: 'CONTACTED', stamp: 'contactedAt' },
  APPLIED: { from: ['NEW', 'CONTACTED'], to: 'APPLIED', stamp: 'appliedAt' },
  ADMITTED: { from: ['APPLIED'], to: 'ADMITTED', stamp: 'decidedAt' },
  NOT_ADMITTED: { from: ['APPLIED'], to: 'NOT_ADMITTED', stamp: 'decidedAt' },
  LOST: { from: OPEN, to: 'LOST', stamp: 'decidedAt' },
  WITHDRAW: { from: OPEN, to: 'WITHDRAWN', stamp: 'decidedAt' },
};

export async function actOnEnquiry(principal: Principal, enquiryId: string, raw: z.input<typeof enquiryActionSchema>, context: { requestId?: string; now?: Date } = {}) {
  if (!isAuthenticated(principal)) throw errors.notFound('Enquiry');
  const input = enquiryActionSchema.parse(raw);
  const now = context.now ?? new Date();
  const enquiry = await db().admissionEnquiry.findUnique({ where: { id: enquiryId }, include: { course: { select: { name: true } }, organization: { select: { name: true } } } });
  if (!enquiry) throw errors.notFound('Enquiry');
  const org = { organizationId: enquiry.organizationId };
  const isStudent = enquiry.studentUserId === principal.userId;
  const manages = can(principal, MANAGE, org);
  const reads = can(principal, READ, org);

  // Who may do what; everyone else is told the enquiry does not exist.
  if (input.action === 'WITHDRAW') {
    if (!isStudent) throw errors.notFound('Enquiry');
  } else if (input.action === 'NOTE' || input.action === 'FOLLOW_UP') {
    if (!manages && !(reads && enquiry.assignedToUserId === principal.userId)) throw reads ? errors.forbidden(MANAGE) : errors.notFound('Enquiry');
  } else if (!manages) {
    throw reads ? errors.forbidden(MANAGE) : errors.notFound('Enquiry');
  }

  const event = (action: string, to: AdmissionEnquiryStatus, note: string | null) => ({ id: newId('admissionEnquiryEvent'), enquiryId, action, fromStatus: enquiry.status, toStatus: to, actorUserId: principal.userId, note });
  const guard = { id: enquiryId, status: enquiry.status };
  const changed = () => errors.conflict('This enquiry changed while you were acting on it. Refresh and try again.');
  let notifyStudent: string | null = null;

  if (input.action in TRANSITIONS) {
    const t = TRANSITIONS[input.action]!;
    const note = 'note' in input ? (input.note ?? null) : null;
    if (!t.from.includes(enquiry.status)) throw errors.preconditionFailed(`An enquiry that is ${ENQUIRY_STATUS_LABEL[enquiry.status].toLowerCase()} cannot be marked ${ENQUIRY_STATUS_LABEL[t.to].toLowerCase()}.`);
    if (input.action === 'LOST' && !note) throw errors.validation('Give a reason.', { field: 'note' });
    const closing = !OPEN.includes(t.to);
    await transaction(async (tx) => {
      const claim = await tx.admissionEnquiry.updateMany({ where: guard, data: { status: t.to, ...(t.stamp ? { [t.stamp]: now } : {}), ...(closing ? { openKey: null, nextFollowUpAt: null } : {}) } });
      if (claim.count === 0) throw changed();
      await tx.admissionEnquiryEvent.create({ data: event(input.action, t.to, note) });
    });
    if (input.action !== 'WITHDRAW') notifyStudent = `Your enquiry about ${enquiry.course.name} at ${enquiry.organization.name} is now: ${ENQUIRY_STATUS_LABEL[t.to].toLowerCase()}.`;
  } else if (input.action === 'ASSIGN') {
    if (!OPEN.includes(enquiry.status)) throw errors.preconditionFailed('This enquiry is closed.');
    if (input.assigneeUserId) {
      const member = await db().organizationMember.count({ where: { organizationId: enquiry.organizationId, userId: input.assigneeUserId, leftAt: null } });
      if (member === 0) throw errors.validation('That person is not a member of this college.', { field: 'assigneeUserId' });
    }
    await transaction(async (tx) => {
      const claim = await tx.admissionEnquiry.updateMany({ where: guard, data: { assignedToUserId: input.assigneeUserId, assignedAt: input.assigneeUserId ? now : null } });
      if (claim.count === 0) throw changed();
      await tx.admissionEnquiryEvent.create({ data: event(input.assigneeUserId ? 'ASSIGNED' : 'UNASSIGNED', enquiry.status, null) });
    });
  } else if (input.action === 'FOLLOW_UP') {
    if (!OPEN.includes(enquiry.status)) throw errors.preconditionFailed('This enquiry is closed.');
    const at = input.at ? new Date(input.at) : null;
    if (at && at.getTime() < now.getTime() - 60_000) throw errors.validation('Choose a time in the future.', { field: 'at' });
    await transaction(async (tx) => {
      const claim = await tx.admissionEnquiry.updateMany({ where: guard, data: { nextFollowUpAt: at } });
      if (claim.count === 0) throw changed();
      await tx.admissionEnquiryEvent.create({ data: event(at ? 'FOLLOW_UP_SET' : 'FOLLOW_UP_CLEARED', enquiry.status, at ? at.toISOString() : null) });
    });
  } else {
    await db().admissionEnquiryEvent.create({ data: event('NOTE', enquiry.status, 'note' in input ? (input.note ?? null) : null) });
  }

  await recordAuditEvent({ action: `ADMISSION_ENQUIRY_${input.action}`, actor: principal.userId, subject: enquiryId, outcome: 'success', organizationId: enquiry.organizationId, requestId: context.requestId });
  if (notifyStudent) {
    await notifyUser({ userId: enquiry.studentUserId, notificationId: 'TL-NOTIF-ADMISSION-UPDATE-001', data: { summary: notifyStudent }, linkUrl: '/account/admissions', requestId: context.requestId });
  }
  return db().admissionEnquiry.findUniqueOrThrow({ where: { id: enquiryId }, select: { id: true, status: true, assignedToUserId: true, nextFollowUpAt: true } });
}

/** A college's enquiries, for members who may read them. */
export async function listEnquiries(principal: Principal, organizationId: string, filter: { status?: AdmissionEnquiryStatus; courseId?: string; assignedToUserId?: string } = {}) {
  if (!isAuthenticated(principal) || !can(principal, READ, { organizationId })) throw errors.notFound('Organization');
  return db().admissionEnquiry.findMany({
    where: { organizationId, ...(filter.status ? { status: filter.status } : {}), ...(filter.courseId ? { courseId: filter.courseId } : {}), ...(filter.assignedToUserId ? { assignedToUserId: filter.assignedToUserId } : {}) },
    include: {
      student: { select: { displayName: true, email: true, phone: true } },
      course: { select: { name: true, level: true } },
      cycle: { select: { academicYear: true } },
      assignedTo: { select: { displayName: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 300,
  });
}

export async function enquiryStats(principal: Principal, organizationId: string) {
  if (!isAuthenticated(principal) || !can(principal, READ, { organizationId })) throw errors.notFound('Organization');
  const [byStatus, byCourse] = await Promise.all([
    db().admissionEnquiry.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
    db().admissionEnquiry.groupBy({ by: ['courseId'], where: { organizationId }, _count: true }),
  ]);
  const count = (s: AdmissionEnquiryStatus) => byStatus.find((r) => r.status === s)?._count ?? 0;
  const total = byStatus.reduce((n, r) => n + r._count, 0);
  const admitted = count('ADMITTED');
  return {
    total,
    open: OPEN.reduce((n, s) => n + count(s), 0),
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])) as Partial<Record<AdmissionEnquiryStatus, number>>,
    byCourse: Object.fromEntries(byCourse.map((r) => [r.courseId, r._count])),
    admitted,
    /** Admitted of all enquiries; null until there is one. */
    admissionRate: total > 0 ? Math.round((admitted / total) * 1000) / 10 : null,
  };
}

/** The signed-in student's own enquiries. */
export async function myEnquiries(principal: Principal) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return db().admissionEnquiry.findMany({
    where: { studentUserId: principal.userId },
    include: { course: { select: { name: true, level: true } }, organization: { select: { name: true, slug: true } }, cycle: { select: { academicYear: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
