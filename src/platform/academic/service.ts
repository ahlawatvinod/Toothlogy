/**
 * TOOTHLOGY ACADEMICS — researchers and faculty
 *
 * A person keeps a researcher profile, a faculty profile, or both: headline,
 * designation, department, institution, ORCID, interests (dental specialties)
 * and publications. All of it is their own statement and is labelled so.
 *
 * A faculty member asks a college to confirm their post; the college's
 * administrators confirm or decline it, and either side may end it. Only a
 * confirmed post is shown as "faculty at" — an unconfirmed one is never
 * presented as the college's word.
 */

import { z } from 'zod';
import { Prisma, type FacultyAppointmentStatus } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyOrganizationAdmins, notifyUser } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { DENTAL_SPECIALTIES } from '../dentists/specialties';
import { slugify } from '../india-data/normalize';

export const ACADEMIC_TYPES = ['RESEARCHER', 'FACULTY'] as const;
export type AcademicType = (typeof ACADEMIC_TYPES)[number];
const CONFIRM = 'tl.education.faculty.confirm';
const SPECIALTY_KEYS = new Set(DENTAL_SPECIALTIES.map((s) => s.key));
const ORCID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const DOI = /^10\.\d{4,9}\/\S+$/;

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return principal;
}

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const httpUrl = z.string().trim().url('Enter a full web address.').max(300).refine((u) => /^https?:\/\//.test(u), 'Use an http(s) address.');

export const academicProfileSchema = z.object({
  type: z.enum(ACADEMIC_TYPES),
  displayName: z.string().trim().min(2, 'Enter your name as it should appear.').max(120),
  headline: text(160),
  bio: text(4000),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lower-case letters, digits and hyphens.').min(3).max(60).optional(),
  isPublic: z.boolean().default(false),
  designation: text(120),
  department: text(120),
  institution: text(200),
  orcid: z.string().trim().toUpperCase().regex(ORCID, 'An ORCID looks like 0000-0002-1825-0097.').nullable().optional(),
  interests: z.array(z.string().max(40)).max(12).optional(),
  website: httpUrl.nullable().optional(),
});

/** Create or update the signed-in person's researcher or faculty profile. */
export async function upsertAcademicProfile(principal: Principal, raw: z.input<typeof academicProfileSchema>, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const input = academicProfileSchema.parse(raw);
  if (input.interests?.some((k) => !SPECIALTY_KEYS.has(k))) throw errors.validation('Choose interests from the list of specialties.', { field: 'interests' });
  const existing = await db().profile.findUnique({ where: { userId_type: { userId: me.userId, type: input.type } } });
  const slug = input.slug ?? existing?.slug ?? `${slugify(input.displayName) || 'academic'}-${me.userId.slice(-5).toLowerCase()}`;
  const academic = { designation: input.designation, department: input.department, institution: input.institution, orcid: input.orcid, interests: input.interests, website: input.website };
  try {
    const profile = await transaction(async (tx) => {
      const row = await tx.profile.upsert({
        where: { userId_type: { userId: me.userId, type: input.type } },
        create: { id: newId('profile'), userId: me.userId, type: input.type, displayName: input.displayName, headline: input.headline ?? null, bio: input.bio ?? null, slug, isPublic: input.isPublic },
        update: { displayName: input.displayName, headline: input.headline, bio: input.bio, slug, isPublic: input.isPublic, deletedAt: null },
      });
      await tx.academicProfile.upsert({ where: { profileId: row.id }, create: { profileId: row.id, ...academic, interests: input.interests ?? [] }, update: academic });
      return row;
    });
    await recordAuditEvent({ action: 'ACADEMIC_PROFILE_SAVED', actor: me.userId, subject: profile.id, outcome: 'success', requestId: context.requestId, detail: { type: input.type, isPublic: input.isPublic } });
    return { profileId: profile.id, slug: profile.slug };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('That web address is taken. Choose another.');
    throw error;
  }
}

async function ownProfile(userId: string, type: AcademicType) {
  const profile = await db().profile.findUnique({ where: { userId_type: { userId, type } } });
  if (!profile || profile.deletedAt) throw errors.preconditionFailed(`Create your ${type === 'FACULTY' ? 'faculty' : 'researcher'} profile first.`);
  return profile;
}

export const publicationSchema = z.object({
  type: z.enum(ACADEMIC_TYPES),
  title: z.string().trim().min(5, 'Enter the title.').max(300),
  venue: text(200),
  year: z.number().int().min(1900).max(2100),
  doi: z.string().trim().toLowerCase().regex(DOI, 'A DOI looks like 10.1177/0022034520915877.').nullable().optional(),
  url: httpUrl.nullable().optional(),
});

export async function addPublication(principal: Principal, raw: z.input<typeof publicationSchema>, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const input = publicationSchema.parse(raw);
  if (input.year > new Date().getFullYear()) throw errors.validation('The year cannot be in the future.', { field: 'year' });
  const profile = await ownProfile(me.userId, input.type);
  if ((await db().publication.count({ where: { profileId: profile.id } })) >= 200) throw errors.preconditionFailed('A profile lists at most 200 publications.');
  const id = newId('publication');
  try {
    await db().publication.create({ data: { id, profileId: profile.id, title: input.title, venue: input.venue ?? null, year: input.year, doi: input.doi ?? null, url: input.url ?? null } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('You already list a publication with that DOI.');
    throw error;
  }
  await recordAuditEvent({ action: 'PUBLICATION_ADDED', actor: me.userId, subject: id, outcome: 'success', requestId: context.requestId });
  return { publicationId: id };
}

export async function removePublication(principal: Principal, publicationId: string, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const done = await db().publication.deleteMany({ where: { id: publicationId, profile: { userId: me.userId } } });
  if (done.count === 0) throw errors.notFound('Publication');
  await recordAuditEvent({ action: 'PUBLICATION_REMOVED', actor: me.userId, subject: publicationId, outcome: 'success', requestId: context.requestId });
}

// ---------------------------------------------------------------------------
// Faculty appointments
// ---------------------------------------------------------------------------

export const appointmentRequestSchema = z.object({
  organizationId: z.string().max(64),
  designation: z.string().trim().min(2, 'Enter your designation.').max(120),
  department: text(120),
});

export async function requestFacultyAppointment(principal: Principal, raw: z.input<typeof appointmentRequestSchema>, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const input = appointmentRequestSchema.parse(raw);
  const profile = await ownProfile(me.userId, 'FACULTY');
  const college = await db().organization.findFirst({ where: { id: input.organizationId, type: 'COLLEGE', deletedAt: null }, select: { id: true, name: true, ownerUserId: true } });
  if (!college) throw errors.validation('Choose a dental college listed on Toothlogy.', { field: 'organizationId' });
  if (!college.ownerUserId) throw errors.preconditionFailed('Nobody from this college manages it on Toothlogy yet, so there is no one to confirm your post.');

  const existing = await db().facultyAppointment.findUnique({ where: { profileId_organizationId: { profileId: profile.id, organizationId: college.id } } });
  let id: string;
  if (existing) {
    if (existing.status === 'PENDING' || existing.status === 'CONFIRMED') throw errors.conflict(existing.status === 'PENDING' ? 'Your request is waiting for the college.' : 'The college already confirmed your post.');
    const reopened = await db().facultyAppointment.updateMany({
      where: { id: existing.id, status: existing.status },
      data: { status: 'PENDING', designation: input.designation, department: input.department ?? null, requestedAt: new Date(), decidedAt: null, decidedByUserId: null, endedAt: null },
    });
    if (reopened.count === 0) throw errors.conflict('Your request changed a moment ago.');
    id = existing.id;
  } else {
    id = newId('facultyAppointment');
    await db().facultyAppointment.create({ data: { id, profileId: profile.id, organizationId: college.id, designation: input.designation, department: input.department ?? null } });
  }
  await recordAuditEvent({ action: 'FACULTY_APPOINTMENT_REQUESTED', actor: me.userId, subject: id, outcome: 'success', organizationId: college.id, requestId: context.requestId });
  await notifyOrganizationAdmins({ organizationId: college.id, notificationId: 'TL-NOTIF-FACULTY-REQUEST-001', data: { summary: `${profile.displayName ?? 'A faculty member'} asked you to confirm their post as ${input.designation}.` }, linkUrl: `/account/organizations/${college.id}/faculty` });
  return { appointmentId: id };
}

export const appointmentDecisionSchema = z.object({ decision: z.enum(['CONFIRM', 'DECLINE', 'END']) });

export async function decideFacultyAppointment(principal: Principal, appointmentId: string, raw: z.input<typeof appointmentDecisionSchema>, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const { decision } = appointmentDecisionSchema.parse(raw);
  const row = await db().facultyAppointment.findUnique({ where: { id: appointmentId }, include: { profile: { select: { userId: true } }, organization: { select: { name: true } } } });
  if (!row) throw errors.notFound('Appointment');
  const college = can(me, CONFIRM, { organizationId: row.organizationId });
  const self = row.profile.userId === me.userId;
  if (!college && !(self && decision === 'END')) throw self ? errors.forbidden(CONFIRM) : errors.notFound('Appointment');
  const from: FacultyAppointmentStatus[] = decision === 'END' ? ['CONFIRMED'] : ['PENDING'];
  const to: FacultyAppointmentStatus = decision === 'CONFIRM' ? 'CONFIRMED' : decision === 'DECLINE' ? 'DECLINED' : 'ENDED';
  const now = new Date();
  const done = await db().facultyAppointment.updateMany({
    where: { id: appointmentId, status: { in: from } },
    data: { status: to, ...(decision === 'END' ? { endedAt: now } : { decidedAt: now, decidedByUserId: me.userId }) },
  });
  if (done.count === 0) throw errors.preconditionFailed(decision === 'END' ? 'Only a confirmed post can be ended.' : 'Only a pending request can be decided.');
  await recordAuditEvent({ action: `FACULTY_APPOINTMENT_${decision}`, actor: me.userId, subject: appointmentId, outcome: 'success', organizationId: row.organizationId, requestId: context.requestId });
  if (!self) {
    await notifyUser({ userId: row.profile.userId, notificationId: 'TL-NOTIF-FACULTY-DECISION-001', data: { summary: decision === 'CONFIRM' ? `${row.organization.name} confirmed your post.` : decision === 'DECLINE' ? `${row.organization.name} did not confirm your post.` : `${row.organization.name} ended your post on Toothlogy.` }, linkUrl: '/account/academic' });
  }
  return { status: to };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function myAcademic(principal: Principal) {
  const me = signedIn(principal);
  return db().profile.findMany({
    where: { userId: me.userId, type: { in: [...ACADEMIC_TYPES] }, deletedAt: null },
    include: { academic: true, publications: { orderBy: [{ year: 'desc' }, { createdAt: 'desc' }] }, facultyAppointments: { include: { organization: { select: { name: true, slug: true } } }, orderBy: { requestedAt: 'desc' } } },
  });
}

export async function getPublicAcademic(type: AcademicType, slug: string) {
  const profile = await db().profile.findFirst({
    where: { type, slug, isPublic: true, deletedAt: null, user: { status: 'ACTIVE', deletedAt: null } },
    include: {
      academic: true,
      publications: { orderBy: [{ year: 'desc' }, { createdAt: 'desc' }] },
      facultyAppointments: { where: { status: 'CONFIRMED' }, include: { organization: { select: { name: true, slug: true } } } },
      user: { select: { dentistProfile: { select: { slug: true, isVerified: true, isDiscoverable: true, verificationExpiresAt: true } } } },
    },
  });
  if (!profile) return null;
  const dentist = profile.user.dentistProfile;
  const now = new Date();
  return { ...profile, verifiedDentist: dentist && dentist.isVerified && (!dentist.verificationExpiresAt || dentist.verificationExpiresAt > now) ? { slug: dentist.slug, listed: dentist.isDiscoverable } : null };
}

export async function listPublicAcademics(filter: { type?: AcademicType; interest?: string } = {}) {
  return db().profile.findMany({
    where: {
      type: filter.type ? filter.type : { in: [...ACADEMIC_TYPES] },
      isPublic: true,
      deletedAt: null,
      user: { status: 'ACTIVE', deletedAt: null },
      ...(filter.interest ? { academic: { interests: { has: filter.interest } } } : {}),
    },
    include: { academic: true, facultyAppointments: { where: { status: 'CONFIRMED' }, include: { organization: { select: { name: true } } } }, _count: { select: { publications: true } } },
    orderBy: { displayName: 'asc' },
    take: 200,
  });
}

/** A college's faculty requests and confirmed posts, for its administrators. */
export async function collegeFaculty(principal: Principal, organizationId: string) {
  if (!isAuthenticated(principal) || !can(principal, CONFIRM, { organizationId })) throw errors.notFound('Organization');
  return db().facultyAppointment.findMany({
    where: { organizationId },
    include: { profile: { select: { displayName: true, slug: true, isPublic: true, academic: { select: { orcid: true, department: true } }, user: { select: { email: true } } } } },
    orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
  });
}

/** Confirmed faculty of a college, for its public page. */
export async function confirmedFaculty(organizationId: string) {
  return db().facultyAppointment.findMany({
    where: { organizationId, status: 'CONFIRMED', profile: { isPublic: true, deletedAt: null } },
    include: { profile: { select: { displayName: true, slug: true } } },
    orderBy: { designation: 'asc' },
  });
}
