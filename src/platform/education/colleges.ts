/**
 * TOOTHLOGY EDUCATION — colleges, courses, admission cycles
 *
 * A dental college is an organization of type COLLEGE. Its administrators
 * keep an academic profile (ownership, affiliation, recognition), its
 * courses (BDS, MDS by specialty, diplomas, certificates, fellowships, PhD)
 * and each course's admission window per academic year.
 *
 * - Recognition is the college's own statement until Toothlogy staff check it
 *   against the regulator's list; changing the stated recognition clears a
 *   previous check.
 * - An MDS course names its specialty from the reference list; no free text.
 * - Only published courses of colleges that are listed (active or pending)
 *   are public, and a college nobody has claimed shows no courses.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { can, isAuthenticated, type Principal } from '../rbac';
import { DENTAL_SPECIALTIES } from '../dentists/specialties';
import { slugify } from '../india-data/normalize';

export const COURSE_LEVELS = ['BDS', 'MDS', 'DIPLOMA', 'CERTIFICATE', 'FELLOWSHIP', 'PHD'] as const;
export const ENTRANCE_EXAMS = ['NEET_UG', 'NEET_MDS', 'INI_CET', 'INSTITUTIONAL', 'NONE'] as const;
export const OWNERSHIPS = ['GOVERNMENT', 'PRIVATE', 'DEEMED_UNIVERSITY', 'AUTONOMOUS'] as const;
export const EXAM_LABEL: Record<(typeof ENTRANCE_EXAMS)[number], string> = {
  NEET_UG: 'NEET-UG',
  NEET_MDS: 'NEET-MDS',
  INI_CET: 'INI-CET',
  INSTITUTIONAL: 'The college’s own test',
  NONE: 'No entrance exam',
};
export const LEVEL_LABEL: Record<(typeof COURSE_LEVELS)[number], string> = {
  BDS: 'BDS',
  MDS: 'MDS',
  DIPLOMA: 'Diploma',
  CERTIFICATE: 'Certificate',
  FELLOWSHIP: 'Fellowship',
  PHD: 'PhD',
};
const SPECIALTY_NAME = new Map(DENTAL_SPECIALTIES.map((s) => [s.key, s.name]));
export const specialtyName = (key: string | null) => (key ? (SPECIALTY_NAME.get(key) ?? key) : null);

const MANAGE = 'tl.education.course.manage';

/** The college the caller may manage; anything else does not exist for them. */
async function managedCollege(principal: Principal, organizationId: string) {
  if (!isAuthenticated(principal) || !can(principal, MANAGE, { organizationId })) throw errors.notFound('Organization');
  const organization = await db().organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true, type: true, currency: true, name: true } });
  if (!organization) throw errors.notFound('Organization');
  if (organization.type !== 'COLLEGE') throw errors.preconditionFailed('Courses and admissions are for dental colleges.');
  return { organization, actor: principal.userId };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const collegeProfileSchema = z.object({
  ownership: z.enum(OWNERSHIPS).nullable().optional(),
  affiliatedUniversity: optionalText(200),
  establishedYear: z.number().int().min(1850).max(2100).nullable().optional(),
  recognitionBody: optionalText(120),
  recognitionReference: optionalText(120),
  admissionsEmail: z.string().trim().email('Enter a valid email address.').max(254).nullable().optional(),
  admissionsPhone: optionalText(24),
});

export async function upsertCollegeProfile(principal: Principal, organizationId: string, raw: z.input<typeof collegeProfileSchema>, context: { requestId?: string } = {}) {
  const { actor } = await managedCollege(principal, organizationId);
  const input = collegeProfileSchema.parse(raw);
  if (input.establishedYear && input.establishedYear > new Date().getFullYear()) throw errors.validation('The year cannot be in the future.', { field: 'establishedYear' });
  const existing = await db().collegeProfile.findUnique({ where: { organizationId } });
  const changed = (key: 'recognitionBody' | 'recognitionReference') => input[key] !== undefined && (input[key] ?? null) !== (existing?.[key] ?? null);
  const resetCheck = Boolean(existing?.recognitionVerifiedAt) && (changed('recognitionBody') || changed('recognitionReference'));
  const profile = await db().collegeProfile.upsert({
    where: { organizationId },
    create: { organizationId, ...input },
    update: { ...input, ...(resetCheck ? { recognitionVerifiedAt: null, recognitionVerifiedByUserId: null } : {}) },
  });
  await recordAuditEvent({ action: 'COLLEGE_PROFILE_UPDATED', actor, subject: organizationId, outcome: 'success', organizationId, requestId: context.requestId, detail: { recognitionCheckCleared: resetCheck } });
  return profile;
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

// A bigint is accepted too: a route hands the service a body it already parsed.
const fee = z
  .union([z.string().regex(/^\d{1,12}$/, 'Enter the fee in paise, digits only.'), z.number().int().min(0).max(1e12), z.bigint().min(BigInt(0)).max(BigInt(1e12))])
  .transform((v) => BigInt(v));

const courseFields = {
  level: z.enum(COURSE_LEVELS),
  specialtyKey: z.string().max(64).nullable().optional(),
  name: z.string().trim().min(3, 'Name the course.').max(160),
  durationMonths: z.number().int().min(1).max(120),
  seats: z.number().int().min(1).max(2000).nullable().optional(),
  annualFeeMinor: fee.nullable().optional(),
  entranceExam: z.enum(ENTRANCE_EXAMS),
  description: optionalText(4000),
};
export const courseSchema = z.object(courseFields);
export const courseUpdateSchema = z.object(courseFields).partial().extend({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional() });

function checkSpecialty(level: string, specialtyKey: string | null | undefined) {
  if (level === 'MDS' && !specialtyKey) throw errors.validation('Choose the MDS specialty.', { field: 'specialtyKey' });
  if (specialtyKey && !SPECIALTY_NAME.has(specialtyKey)) throw errors.validation('That is not a dental specialty Toothlogy lists.', { field: 'specialtyKey' });
}

export async function createCourse(principal: Principal, organizationId: string, raw: z.input<typeof courseSchema>, context: { requestId?: string } = {}) {
  const { organization, actor } = await managedCollege(principal, organizationId);
  const input = courseSchema.parse(raw);
  checkSpecialty(input.level, input.specialtyKey);
  const base = slugify(input.name) || 'course';
  const id = newId('course');
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      await db().course.create({
        data: {
          id,
          organizationId,
          level: input.level,
          specialtyKey: input.level === 'MDS' ? (input.specialtyKey ?? null) : (input.specialtyKey ?? null),
          name: input.name,
          slug,
          durationMonths: input.durationMonths,
          seats: input.seats ?? null,
          annualFeeMinor: input.annualFeeMinor ?? null,
          currency: input.annualFeeMinor != null ? organization.currency : null,
          entranceExam: input.entranceExam,
          description: input.description ?? null,
        },
      });
      await recordAuditEvent({ action: 'COURSE_CREATED', actor, subject: id, outcome: 'success', organizationId, requestId: context.requestId, detail: { level: input.level } });
      return { courseId: id, slug };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }
  throw errors.conflict('This college already has several courses with that name. Choose a more specific name.');
}

async function courseOf(principal: Principal, courseId: string) {
  const course = await db().course.findUnique({ where: { id: courseId } });
  if (!course) throw errors.notFound('Course');
  const { organization, actor } = await managedCollege(principal, course.organizationId);
  return { course, organization, actor };
}

export async function updateCourse(principal: Principal, courseId: string, raw: z.input<typeof courseUpdateSchema>, context: { requestId?: string } = {}) {
  const { course, organization, actor } = await courseOf(principal, courseId);
  const input = courseUpdateSchema.parse(raw);
  const level = input.level ?? course.level;
  const specialtyKey = input.specialtyKey !== undefined ? input.specialtyKey : course.specialtyKey;
  checkSpecialty(level, specialtyKey);
  const updated = await db().course.update({
    where: { id: courseId },
    data: {
      ...input,
      specialtyKey,
      ...(input.annualFeeMinor !== undefined ? { currency: input.annualFeeMinor === null ? null : organization.currency } : {}),
    },
  });
  await recordAuditEvent({ action: 'COURSE_UPDATED', actor, subject: courseId, outcome: 'success', organizationId: course.organizationId, requestId: context.requestId, detail: { status: input.status ?? null } });
  return updated;
}

// ---------------------------------------------------------------------------
// Admission cycles
// ---------------------------------------------------------------------------

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date.');
export const cycleSchema = z
  .object({
    academicYear: z.string().regex(/^20\d{2}-\d{2}$/, 'Write the academic year as 2026-27.'),
    opensOn: day,
    closesOn: day,
    seats: z.number().int().min(1).max(2000).nullable().optional(),
    notes: optionalText(1000),
  })
  .refine((v) => v.closesOn >= v.opensOn, { message: 'The closing date is before the opening date.', path: ['closesOn'] })
  .refine((v) => (Number(v.academicYear.slice(0, 4)) + 1) % 100 === Number(v.academicYear.slice(5)), { message: 'The two years must follow each other, as in 2026-27.', path: ['academicYear'] });

const asDay = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function upsertAdmissionCycle(principal: Principal, courseId: string, raw: z.input<typeof cycleSchema>, context: { requestId?: string } = {}) {
  const { course, actor } = await courseOf(principal, courseId);
  const input = cycleSchema.parse(raw);
  const data = { opensOn: asDay(input.opensOn), closesOn: asDay(input.closesOn), seats: input.seats ?? null, notes: input.notes ?? null };
  const cycle = await db().admissionCycle.upsert({
    where: { courseId_academicYear: { courseId, academicYear: input.academicYear } },
    create: { id: newId('admissionCycle'), courseId, academicYear: input.academicYear, ...data },
    update: data,
  });
  await recordAuditEvent({ action: 'ADMISSION_CYCLE_SAVED', actor, subject: cycle.id, outcome: 'success', organizationId: course.organizationId, requestId: context.requestId, detail: { academicYear: input.academicYear } });
  return cycle;
}

/** Today's calendar date where Indian admissions run. */
export function admissionsToday(now: Date = new Date(), timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function cycleState(cycle: { opensOn: Date; closesOn: Date }, today: string): 'UPCOMING' | 'OPEN' | 'CLOSED' {
  const opens = cycle.opensOn.toISOString().slice(0, 10);
  const closes = cycle.closesOn.toISOString().slice(0, 10);
  return today < opens ? 'UPCOMING' : today > closes ? 'CLOSED' : 'OPEN';
}

/** The window an enquiry made today belongs to: the open one, else the next. */
export async function currentCycle(courseId: string, today: string = admissionsToday()) {
  return db().admissionCycle.findFirst({ where: { courseId, closesOn: { gte: asDay(today) } }, orderBy: { opensOn: 'asc' } });
}

// ---------------------------------------------------------------------------
// Reading: console and public
// ---------------------------------------------------------------------------

export async function collegeConsole(principal: Principal, organizationId: string) {
  const { organization } = await managedCollege(principal, organizationId);
  const [profile, courses] = await Promise.all([
    db().collegeProfile.findUnique({ where: { organizationId } }),
    db().course.findMany({ where: { organizationId }, include: { cycles: { orderBy: { academicYear: 'desc' }, take: 3 }, _count: { select: { enquiries: true } } }, orderBy: [{ status: 'asc' }, { level: 'asc' }, { name: 'asc' }] }),
  ]);
  return { organization, profile, courses };
}

const LISTED = { deletedAt: null, type: 'COLLEGE' as const, status: { in: ['ACTIVE' as const, 'PENDING' as const] } };

export async function listPublicColleges(filter: { level?: (typeof COURSE_LEVELS)[number]; regionId?: string; districtId?: string } = {}) {
  return db().organization.findMany({
    where: {
      ...LISTED,
      ownerUserId: { not: null },
      courses: { some: { status: 'PUBLISHED', ...(filter.level ? { level: filter.level } : {}) } },
      ...(filter.districtId || filter.regionId
        ? { locations: { some: { deletedAt: null, ...(filter.districtId ? { districtId: filter.districtId } : {}), ...(filter.regionId ? { district: { regionId: filter.regionId } } : {}) } } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      verifiedAt: true,
      collegeProfile: { select: { ownership: true, affiliatedUniversity: true, recognitionVerifiedAt: true } },
      courses: { where: { status: 'PUBLISHED' }, select: { level: true, specialtyKey: true }, orderBy: { level: 'asc' } },
      locations: { where: { deletedAt: null }, orderBy: { isPrimary: 'desc' }, take: 1, select: { district: { select: { name: true, region: { select: { name: true } } } }, address: { select: { locality: true } } } },
    },
    orderBy: { name: 'asc' },
    take: 200,
  });
}

export async function getPublicCollege(slug: string) {
  const college = await db().organization.findFirst({
    where: { ...LISTED, slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      website: true,
      verifiedAt: true,
      verificationExpires: true,
      ownerUserId: true,
      collegeProfile: true,
      locations: { where: { deletedAt: null }, orderBy: { isPrimary: 'desc' }, take: 1, select: { name: true, district: { select: { name: true, region: { select: { name: true } } } }, address: { select: { lines: true, locality: true, postalCode: true } } } },
      courses: {
        where: { status: 'PUBLISHED' },
        include: { cycles: { orderBy: { academicYear: 'desc' }, take: 2 } },
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
      },
    },
  });
  if (!college) return null;
  const claimed = college.ownerUserId !== null;
  const now = new Date();
  return {
    ...college,
    // An unclaimed listing has nobody to publish or answer for its courses.
    courses: claimed ? college.courses : [],
    isClaimed: claimed,
    isVerified: college.verifiedAt !== null && (college.verificationExpires === null || college.verificationExpires > now),
    recognitionVerified: Boolean(college.collegeProfile?.recognitionVerifiedAt),
  };
}

// ---------------------------------------------------------------------------
// Staff: recognition checks
// ---------------------------------------------------------------------------

const VERIFY = 'tl.education.recognition.verify';
export const recognitionSchema = z.object({ decision: z.enum(['VERIFY', 'WITHDRAW']), note: z.string().trim().max(500).optional() });

export async function decideRecognition(principal: Principal, organizationId: string, raw: z.input<typeof recognitionSchema>, context: { requestId?: string } = {}) {
  if (!isAuthenticated(principal) || !can(principal, VERIFY)) throw errors.forbidden(VERIFY);
  const input = recognitionSchema.parse(raw);
  const profile = await db().collegeProfile.findUnique({ where: { organizationId } });
  if (!profile) throw errors.notFound('College');
  if (input.decision === 'VERIFY' && (!profile.recognitionBody || !profile.recognitionReference)) {
    throw errors.preconditionFailed('The college has not stated a recognising body and reference to check.');
  }
  await db().collegeProfile.update({
    where: { organizationId },
    data: input.decision === 'VERIFY' ? { recognitionVerifiedAt: new Date(), recognitionVerifiedByUserId: principal.userId } : { recognitionVerifiedAt: null, recognitionVerifiedByUserId: null },
  });
  await recordAuditEvent({ action: input.decision === 'VERIFY' ? 'COLLEGE_RECOGNITION_VERIFIED' : 'COLLEGE_RECOGNITION_WITHDRAWN', actor: principal.userId, subject: organizationId, outcome: 'success', requestId: context.requestId, detail: { note: input.note ?? null, body: profile.recognitionBody, reference: profile.recognitionReference } });
}

export async function collegesForReview(principal: Principal) {
  if (!isAuthenticated(principal) || !can(principal, VERIFY)) throw errors.forbidden(VERIFY);
  return db().organization.findMany({
    where: { type: 'COLLEGE', deletedAt: null, collegeProfile: { isNot: null } },
    select: { id: true, name: true, slug: true, status: true, ownerUserId: true, collegeProfile: true, _count: { select: { courses: { where: { status: 'PUBLISHED' } } } } },
    orderBy: { name: 'asc' },
    take: 500,
  });
}
