/**
 * TOOTHLOGY EDUCATION — enrolment, the end of the admission funnel
 *
 *   ADMITTED enquiry → ENROLLED → COMPLETED | WITHDRAWN
 *
 * - A college enrols a student it admitted, for an academic year, with an
 *   optional roll number; one enrolment per student, course and year, and
 *   roll numbers are unique within a course and year. The student is told.
 * - The college marks an enrolment completed or withdrawn, with the date (and
 *   the reason for a withdrawal); the student is told. Nothing is deleted.
 * - The college sees its roll by course, year and status; the student sees
 *   their own enrolments. Only the college's administrators see the roll.
 * - A record of study, not a certificate: nothing here claims a degree.
 */

import { z } from 'zod';
import { Prisma, type EnrolmentStatus } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyUser } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';

export const MANAGE = 'tl.education.enrolment.manage';
const DAY = 86_400_000;

export const ENROLMENT_STATUS_LABEL: Readonly<Record<EnrolmentStatus, string>> = { ENROLLED: 'Enrolled', COMPLETED: 'Completed', WITHDRAWN: 'Withdrawn' };

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return principal;
}

/** Validate as the routes do: a bad input is VALIDATION_FAILED naming the field. */
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  throw errors.validation(issue.message, issue.path.length ? { field: issue.path.map(String).join('.') } : undefined);
}

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date.');

/** "2026-27": two consecutive years. */
export function isAcademicYear(text: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(text);
  return Boolean(m && (Number(m[1]) + 1) % 100 === Number(m[2]));
}

function day(text: string, field: string): Date {
  const d = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw errors.validation('Choose the date.', { field });
  return d;
}

export const enrolSchema = z.object({
  academicYear: z.string().refine(isAcademicYear, 'Give the academic year as two consecutive years, like 2026-27.'),
  rollNumber: z.string().trim().max(40).optional(),
  startedOn: dateOnly,
});

/** Enrol a student the college admitted, from their enquiry. */
export async function enrolFromEnquiry(principal: Principal, enquiryId: string, raw: z.input<typeof enrolSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = parse(enrolSchema, raw);
  const now = context.now ?? new Date();
  const enquiry = await db().admissionEnquiry.findUnique({
    where: { id: enquiryId },
    include: { course: { select: { name: true } }, organization: { select: { name: true } }, enrolment: { select: { id: true } } },
  });
  if (!enquiry || !can(me, MANAGE, { organizationId: enquiry.organizationId })) throw errors.notFound('Enquiry');
  if (enquiry.status !== 'ADMITTED') throw errors.preconditionFailed('Only a student you have admitted can be enrolled.');
  if (enquiry.enrolment) throw errors.conflict('This student is already enrolled from this enquiry.');
  const startedOn = day(input.startedOn, 'startedOn');
  if (startedOn.getTime() > now.getTime() + 366 * DAY) throw errors.validation('Choose a start date within a year.', { field: 'startedOn' });
  const id = newId('enrolment');
  try {
    await db().enrolment.create({
      data: { id, organizationId: enquiry.organizationId, courseId: enquiry.courseId, cycleId: enquiry.cycleId, studentUserId: enquiry.studentUserId, enquiryId: enquiry.id, academicYear: input.academicYear, rollNumber: input.rollNumber || null, startedOn, createdByUserId: me.userId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const fields = String((error.meta as { target?: unknown } | undefined)?.target ?? '');
      throw errors.conflict(fields.includes('rollNumber') ? 'That roll number is already taken on this course for that year.' : 'This student is already enrolled on this course for that year.');
    }
    throw error;
  }
  await recordAuditEvent({ action: 'ENROLMENT_CREATED', actor: me.userId, subject: id, organizationId: enquiry.organizationId, outcome: 'success', requestId: context.requestId, detail: { academicYear: input.academicYear } });
  await notifyUser({ userId: enquiry.studentUserId, notificationId: 'TL-NOTIF-ENROLMENT-001', data: { college: enquiry.organization.name, course: enquiry.course.name, change: `you are enrolled for ${input.academicYear}` }, linkUrl: '/account/admissions', requestId: context.requestId });
  return { enrolmentId: id };
}

export const endSchema = z.object({
  status: z.enum(['COMPLETED', 'WITHDRAWN']),
  endedOn: dateOnly,
  reason: z.string().trim().max(300).optional(),
});

/** Mark an enrolment completed or withdrawn. */
export async function endEnrolment(principal: Principal, enrolmentId: string, raw: z.input<typeof endSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = parse(endSchema, raw);
  const now = context.now ?? new Date();
  const enrolment = await db().enrolment.findUnique({ where: { id: enrolmentId }, include: { course: { select: { name: true } }, organization: { select: { name: true } } } });
  if (!enrolment || !can(me, MANAGE, { organizationId: enrolment.organizationId })) throw errors.notFound('Enrolment');
  if (input.status === 'WITHDRAWN' && (input.reason ?? '').length < 5) throw errors.validation('Say why, in a few words.', { field: 'reason' });
  const endedOn = day(input.endedOn, 'endedOn');
  if (endedOn < enrolment.startedOn) throw errors.validation('The end date is before the enrolment began.', { field: 'endedOn' });
  if (endedOn.getTime() > now.getTime() + DAY) throw errors.validation('The end date is in the future.', { field: 'endedOn' });
  const moved = await db().enrolment.updateMany({ where: { id: enrolment.id, status: 'ENROLLED' }, data: { status: input.status, endedOn, endedReason: input.reason || null } });
  if (moved.count === 0) throw errors.conflict('This enrolment has already ended.');
  await recordAuditEvent({ action: `ENROLMENT_${input.status}`, actor: me.userId, subject: enrolment.id, organizationId: enrolment.organizationId, outcome: 'success', requestId: context.requestId });
  await notifyUser({
    userId: enrolment.studentUserId,
    notificationId: 'TL-NOTIF-ENROLMENT-001',
    data: { college: enrolment.organization.name, course: enrolment.course.name, change: input.status === 'COMPLETED' ? 'your enrolment is marked completed' : 'your enrolment is recorded as withdrawn' },
    linkUrl: '/account/admissions',
    requestId: context.requestId,
  });
  return { status: input.status };
}

export const rollSchema = z.object({
  courseId: z.string().max(64).optional(),
  academicYear: z.string().refine(isAcademicYear).optional(),
  status: z.enum(['ENROLLED', 'COMPLETED', 'WITHDRAWN']).optional(),
});

/** The college's roll, with the choices for filtering it. */
export async function collegeRoll(principal: Principal, organizationId: string, raw: z.input<typeof rollSchema> = {}) {
  const me = signedIn(principal);
  if (!can(me, MANAGE, { organizationId })) throw errors.notFound('Organization');
  const filter = parse(rollSchema, raw);
  const [organization, enrolments, courses, years] = await Promise.all([
    db().organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true, name: true } }),
    db().enrolment.findMany({
      where: { organizationId, ...(filter.courseId ? { courseId: filter.courseId } : {}), ...(filter.academicYear ? { academicYear: filter.academicYear } : {}), ...(filter.status ? { status: filter.status } : {}) },
      orderBy: [{ academicYear: 'desc' }, { course: { name: 'asc' } }, { rollNumber: 'asc' }],
      include: { student: { select: { displayName: true, email: true, phone: true } }, course: { select: { id: true, name: true, level: true } } },
      take: 1000,
    }),
    db().course.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db().enrolment.findMany({ where: { organizationId }, select: { academicYear: true }, distinct: ['academicYear'], orderBy: { academicYear: 'desc' } }),
  ]);
  if (!organization) throw errors.notFound('Organization');
  return { organization, enrolments, courses, years: years.map((y) => y.academicYear) };
}

/** The student's own enrolments. */
export async function myEnrolments(principal: Principal) {
  const me = signedIn(principal);
  return db().enrolment.findMany({
    where: { studentUserId: me.userId },
    orderBy: { startedOn: 'desc' },
    select: { id: true, academicYear: true, rollNumber: true, status: true, startedOn: true, endedOn: true, organization: { select: { name: true, slug: true } }, course: { select: { name: true, level: true } } },
  });
}

/** Enrolments recorded from a college's enquiries, keyed by enquiry — for the admissions page. */
export async function enrolmentsByEnquiry(organizationId: string) {
  const rows = await db().enrolment.findMany({ where: { organizationId, enquiryId: { not: null } }, select: { enquiryId: true, academicYear: true, rollNumber: true, status: true } });
  return new Map(rows.map((r) => [r.enquiryId!, r]));
}
