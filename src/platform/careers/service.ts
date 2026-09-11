/**
 * TOOTHLOGY CAREERS — jobs and internships across dentistry
 *
 * - Organizations post. Only one Toothlogy has verified may publish (open) a
 *   posting, so job seekers are not sent to unchecked employers.
 * - A posting says what the job is, where, and — if the employer chooses — the
 *   pay: stated, not checked. No phone numbers, emails or links in the text;
 *   applications go through Toothlogy, which keeps applicants' details from
 *   being harvested and gives every applicant an answer trail.
 * - Anyone signed in with a verified email may apply, once per posting, with a
 *   résumé (PDF or Word, through the file service) and a note, agreeing to
 *   share their contact details with that employer. The employer's members
 *   who may read applications see them — contact details and résumé only while
 *   the application stands (a withdrawal takes them back).
 * - The employer moves an application through shortlist, interview, offer,
 *   hired or not taken forward; the applicant is told each step and may
 *   withdraw. Internal notes stay with the employer.
 * - Postings past their closing date close themselves (`careers.close-expired`).
 */

import { z } from 'zod';
import { Prisma, type JobApplicationStatus } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyOrganizationAdmins, notifyUser } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { uploadFile } from '../storage/files';
import { DENTAL_SPECIALTIES } from '../dentists/specialties';
import { containsContactDetails } from '@/lib/contact-details';

export const MANAGE = 'tl.careers.posting.manage';
export const READ_APPLICATIONS = 'tl.careers.application.read';
export const MANAGE_APPLICATIONS = 'tl.careers.application.manage';
const DAY = 86_400_000;
const PAGE_SIZE = 20;
const APPLICATIONS_PER_DAY = 10;
const POSTINGS_PER_DAY = 20;
const KINDS = ['JOB', 'INTERNSHIP'] as const;
const ROLES = ['DENTIST', 'SPECIALIST', 'INTERN', 'ASSISTANT', 'HYGIENIST', 'TECHNICIAN', 'RECEPTIONIST', 'FACULTY', 'MANAGER', 'OTHER'] as const;
const TYPES = ['FULL_TIME', 'PART_TIME', 'VISITING', 'LOCUM', 'INTERNSHIP'] as const;

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

const LINK = /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\./i;

// ---------------------------------------------------------------------------
// Postings
// ---------------------------------------------------------------------------

// No defaults: the update schema is `.partial()` of this one.
export const postingSchema = z.object({
  kind: z.enum(KINDS),
  role: z.enum(ROLES),
  employmentType: z.enum(TYPES),
  title: z.string().trim().min(5, 'Give it a title.').max(120),
  description: z.string().trim().min(80, 'Describe the role (80 characters or more).').max(8000),
  requirements: z.string().trim().max(3000).optional(),
  specialtyKey: z.string().max(80).optional(),
  districtId: z.string().max(64).optional(),
  city: z.string().trim().max(80).optional(),
  /** Whole rupees a month. */
  payMin: z.number().int().min(0).max(10_000_000).optional(),
  payMax: z.number().int().min(0).max(10_000_000).optional(),
  openings: z.number().int().min(1).max(100).optional(),
  closesOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the closing date.').optional(),
});
export const postingUpdateSchema = postingSchema.partial();
type PostingInput = z.infer<typeof postingUpdateSchema>;

interface Current {
  kind: string;
  employmentType: string;
  payMinMinor: number | null;
  payMaxMinor: number | null;
}

/** Checks a (partial) posting against itself and what it already is; returns the columns to write. */
async function shape(input: PostingInput, now: Date, current?: Current) {
  for (const field of ['title', 'description', 'requirements'] as const) {
    const text = input[field];
    if (!text) continue;
    if (LINK.test(text)) throw errors.validation('Leave links out; applicants apply through Toothlogy.', { field });
    if (containsContactDetails(text)) throw errors.validation('Leave out phone numbers and email addresses; applicants apply through Toothlogy.', { field });
  }
  const kind = input.kind ?? current?.kind;
  const employmentType = input.employmentType ?? current?.employmentType;
  if (kind === 'INTERNSHIP' && employmentType !== 'INTERNSHIP') throw errors.validation('An internship is employment type “Internship”.', { field: 'employmentType' });
  if (kind === 'JOB' && employmentType === 'INTERNSHIP') throw errors.validation('Choose how the job is held: full-time, part-time, visiting or locum.', { field: 'employmentType' });
  const payMinMinor = input.payMin !== undefined ? input.payMin * 100 : (current?.payMinMinor ?? null);
  const payMaxMinor = input.payMax !== undefined ? input.payMax * 100 : (current?.payMaxMinor ?? null);
  if (payMinMinor != null && payMaxMinor != null && payMinMinor > payMaxMinor) throw errors.validation('The lower pay figure is above the higher one.', { field: 'payMin' });
  if (input.specialtyKey && !DENTAL_SPECIALTIES.some((s) => s.key === input.specialtyKey)) throw errors.validation('Choose a specialty from the list.', { field: 'specialtyKey' });
  if (input.districtId && !(await db().district.findUnique({ where: { id: input.districtId }, select: { id: true } }))) throw errors.validation('Choose a district from the list.', { field: 'districtId' });
  let closesAt: Date | null | undefined;
  if (input.closesOn !== undefined) {
    // The end of the chosen day in India, where every current posting is.
    closesAt = new Date(`${input.closesOn}T23:59:59+05:30`);
    if (Number.isNaN(closesAt.getTime()) || closesAt.getTime() <= now.getTime()) throw errors.validation('Choose a closing date from today on.', { field: 'closesOn' });
    if (closesAt.getTime() > now.getTime() + 366 * DAY) throw errors.validation('Choose a closing date within a year.', { field: 'closesOn' });
  }
  return {
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.employmentType !== undefined ? { employmentType: input.employmentType } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.requirements !== undefined ? { requirements: input.requirements || null } : {}),
    ...(input.specialtyKey !== undefined ? { specialtyKey: input.specialtyKey || null } : {}),
    ...(input.districtId !== undefined ? { districtId: input.districtId || null } : {}),
    ...(input.city !== undefined ? { city: input.city || null } : {}),
    ...(input.payMin !== undefined ? { payMinMinor } : {}),
    ...(input.payMax !== undefined ? { payMaxMinor } : {}),
    ...(input.openings !== undefined ? { openings: input.openings } : {}),
    ...(closesAt !== undefined ? { closesAt } : {}),
  };
}

export async function createPosting(principal: Principal, organizationId: string, raw: z.input<typeof postingSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  if (!can(me, MANAGE, { organizationId })) throw errors.notFound('Organization');
  const input = parse(postingSchema, raw);
  const now = context.now ?? new Date();
  const organization = await db().organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true } });
  if (!organization) throw errors.notFound('Organization');
  if ((await db().jobPosting.count({ where: { organizationId, createdAt: { gte: new Date(now.getTime() - DAY) } } })) >= POSTINGS_PER_DAY) throw errors.rateLimited(3600);
  const data = await shape(input, now);
  const id = newId('posting');
  await db().jobPosting.create({
    data: { id, organizationId, kind: input.kind, role: input.role, employmentType: input.employmentType, title: input.title, description: input.description, ...data, status: 'DRAFT', createdByUserId: me.userId, createdAt: now },
  });
  await recordAuditEvent({ action: 'JOB_POSTING_CREATED', actor: me.userId, subject: id, organizationId, outcome: 'success', requestId: context.requestId });
  return { postingId: id };
}

async function managedPosting(me: AuthenticatedPrincipal, postingId: string) {
  const posting = await db().jobPosting.findUnique({ where: { id: postingId } });
  if (!posting || !can(me, MANAGE, { organizationId: posting.organizationId })) throw errors.notFound('Posting');
  return posting;
}

export async function updatePosting(principal: Principal, postingId: string, raw: z.input<typeof postingUpdateSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = parse(postingUpdateSchema, raw);
  const posting = await managedPosting(me, postingId);
  if (posting.status === 'FILLED') throw errors.preconditionFailed('This posting is filled. Post a new one instead.');
  const data = await shape(input, context.now ?? new Date(), posting);
  await db().jobPosting.update({ where: { id: posting.id }, data });
  await recordAuditEvent({ action: 'JOB_POSTING_EDITED', actor: me.userId, subject: posting.id, organizationId: posting.organizationId, outcome: 'success', requestId: context.requestId });
  return { updated: true };
}

export const postingStatusSchema = z.object({ status: z.enum(['OPEN', 'CLOSED', 'FILLED']) });

/** Publish (only a verified organization), close, or mark filled. */
export async function setPostingStatus(principal: Principal, postingId: string, raw: z.input<typeof postingStatusSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const { status } = parse(postingStatusSchema, raw);
  const now = context.now ?? new Date();
  const posting = await managedPosting(me, postingId);
  if (status === 'OPEN') {
    const org = await db().organization.findUniqueOrThrow({ where: { id: posting.organizationId }, select: { verifiedAt: true, verificationExpires: true } });
    if (!org.verifiedAt || (org.verificationExpires && org.verificationExpires <= now)) {
      throw errors.preconditionFailed('Only organizations Toothlogy has verified can publish postings. Ask for verification on your organization page.');
    }
    if (posting.closesAt && posting.closesAt <= now) throw errors.preconditionFailed('Set a closing date in the future first.');
  }
  const moved = await db().jobPosting.updateMany({
    where: { id: posting.id, status: { not: status } },
    data: status === 'OPEN' ? { status, publishedAt: posting.publishedAt ?? now, closedAt: null } : { status, closedAt: now },
  });
  if (moved.count === 0) throw errors.conflict('It already is.');
  await recordAuditEvent({ action: `JOB_POSTING_${status}`, actor: me.userId, subject: posting.id, organizationId: posting.organizationId, outcome: 'success', requestId: context.requestId });
  return { status };
}

/** The organization's postings with their applications counted by status. */
export async function organizationPostings(principal: Principal, organizationId: string) {
  const me = signedIn(principal);
  if (!can(me, MANAGE, { organizationId }) && !can(me, READ_APPLICATIONS, { organizationId })) throw errors.notFound('Organization');
  const [organization, postings, counts] = await Promise.all([
    db().organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true, name: true, verifiedAt: true } }),
    db().jobPosting.findMany({ where: { organizationId }, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], include: { district: { select: { name: true } } } }),
    db().jobApplication.groupBy({ by: ['postingId', 'status'], where: { posting: { organizationId } }, _count: { _all: true } }),
  ]);
  if (!organization) throw errors.notFound('Organization');
  const tally = new Map<string, { total: number; waiting: number }>();
  for (const c of counts) {
    const t = tally.get(c.postingId) ?? { total: 0, waiting: 0 };
    if (c.status !== 'WITHDRAWN') t.total += c._count._all;
    if (c.status === 'SUBMITTED') t.waiting += c._count._all;
    tally.set(c.postingId, t);
  }
  return { organization, postings: postings.map((p) => ({ ...p, applications: tally.get(p.id) ?? { total: 0, waiting: 0 } })), canManage: can(me, MANAGE, { organizationId }) };
}

// ---------------------------------------------------------------------------
// The public board
// ---------------------------------------------------------------------------

const VISIBLE = (now: Date): Prisma.JobPostingWhereInput => ({ status: 'OPEN', OR: [{ closesAt: null }, { closesAt: { gt: now } }], organization: { deletedAt: null } });

export const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(KINDS).optional(),
  role: z.enum(ROLES).optional(),
  districtId: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).max(200).optional(),
});

export async function listPostings(raw: z.input<typeof searchSchema>, now = new Date()) {
  const input = parse(searchSchema, raw);
  const page = input.page ?? 1;
  const where: Prisma.JobPostingWhereInput = {
    AND: [
      VISIBLE(now),
      ...(input.kind ? [{ kind: input.kind }] : []),
      ...(input.role ? [{ role: input.role }] : []),
      ...(input.districtId ? [{ districtId: input.districtId }] : []),
      ...(input.q
        ? [{ OR: [{ title: { contains: input.q, mode: 'insensitive' as const } }, { description: { contains: input.q, mode: 'insensitive' as const } }, { city: { contains: input.q, mode: 'insensitive' as const } }, { organization: { name: { contains: input.q, mode: 'insensitive' as const } } }] }]
        : []),
    ],
  };
  const [rows, total] = await Promise.all([
    db().jobPosting.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: { id: true, kind: true, role: true, employmentType: true, title: true, city: true, payMinMinor: true, payMaxMinor: true, closesAt: true, publishedAt: true, district: { select: { name: true } }, organization: { select: { name: true, slug: true } } },
    }),
    db().jobPosting.count({ where }),
  ]);
  return { items: rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** A posting for the public page: open ones, and closed or filled ones marked not accepting. Drafts do not exist. */
export async function getPosting(postingId: string, now = new Date()) {
  const p = await db().jobPosting.findFirst({
    where: { id: postingId, status: { in: ['OPEN', 'CLOSED', 'FILLED'] }, organization: { deletedAt: null } },
    include: { district: { select: { name: true } }, organization: { select: { id: true, name: true, slug: true, type: true, verifiedAt: true } } },
  });
  if (!p) return null;
  return { ...p, accepting: p.status === 'OPEN' && (!p.closesAt || p.closesAt > now) };
}

/** Postings for the sitemap. */
export async function openPostingIds(limit = 2000) {
  return db().jobPosting.findMany({ where: VISIBLE(new Date()), select: { id: true, updatedAt: true }, orderBy: { publishedAt: 'desc' }, take: limit });
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

export interface UploadedBytes {
  readonly filename: string;
  readonly declaredType: string;
  readonly bytes: Uint8Array;
}

export const applySchema = z.object({
  coverNote: z.string().trim().max(3000).optional(),
  consent: z.boolean().refine((v) => v, 'Agree to share your contact details with this employer.'),
});

export async function applyToPosting(principal: Principal, postingId: string, raw: z.input<typeof applySchema>, resume?: UploadedBytes, context: { requestId?: string; ipAddress?: string | null; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = parse(applySchema, raw);
  const now = context.now ?? new Date();
  const user = await db().user.findUnique({ where: { id: me.userId }, select: { emailVerifiedAt: true, status: true, displayName: true } });
  if (!user || user.status !== 'ACTIVE') throw errors.unauthenticated();
  if (!user.emailVerifiedAt) throw errors.preconditionFailed('Verify your email address first, so the employer can reply to you.');
  const posting = await getPosting(postingId, now);
  if (!posting) throw errors.notFound('Posting');
  if (!posting.accepting) throw errors.preconditionFailed('This posting is no longer accepting applications.');
  if ((await db().organizationMember.count({ where: { organizationId: posting.organizationId, userId: me.userId, leftAt: null } })) > 0) throw errors.preconditionFailed('You work at this organization.');
  if ((await db().jobApplication.count({ where: { postingId, applicantUserId: me.userId } })) > 0) throw errors.conflict('You have already applied for this.');
  if ((await db().jobApplication.count({ where: { applicantUserId: me.userId, createdAt: { gte: new Date(now.getTime() - DAY) } } })) >= APPLICATIONS_PER_DAY) throw errors.rateLimited(3600);
  const file = resume ? await uploadFile({ principal: me, purpose: 'RESUME', filename: resume.filename, declaredType: resume.declaredType, bytes: resume.bytes, ipAddress: context.ipAddress, requestId: context.requestId }) : null;
  const id = newId('application');
  try {
    await db().jobApplication.create({ data: { id, postingId, applicantUserId: me.userId, resumeFileId: file?.id ?? null, coverNote: input.coverNote || null, contactConsentAt: now, status: 'SUBMITTED', statusChangedAt: now, createdAt: now } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('You have already applied for this.');
    throw error;
  }
  await recordAuditEvent({ action: 'JOB_APPLICATION_SUBMITTED', actor: me.userId, subject: id, organizationId: posting.organizationId, outcome: 'success', requestId: context.requestId, detail: { postingId } });
  await notifyOrganizationAdmins({ organizationId: posting.organizationId, notificationId: 'TL-NOTIF-APPLICATION-RECEIVED-001', data: { applicant: user.displayName ?? 'Someone', title: posting.title }, linkUrl: `/account/organizations/${posting.organizationId}/careers/${postingId}` });
  return { applicationId: id };
}

export async function myApplications(principal: Principal) {
  const me = signedIn(principal);
  return db().jobApplication.findMany({
    where: { applicantUserId: me.userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, interviewAt: true, messageToApplicant: true, statusChangedAt: true, createdAt: true, posting: { select: { id: true, title: true, status: true, organization: { select: { name: true } } } } },
  });
}

export async function withdrawApplication(principal: Principal, applicationId: string, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const a = await db().jobApplication.findFirst({ where: { id: applicationId, applicantUserId: me.userId }, select: { id: true, posting: { select: { organizationId: true } } } });
  if (!a) throw errors.notFound('Application');
  const now = context.now ?? new Date();
  const moved = await db().jobApplication.updateMany({ where: { id: a.id, status: { in: ['SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED'] } }, data: { status: 'WITHDRAWN', withdrawnAt: now, statusChangedAt: now } });
  if (moved.count === 0) throw errors.conflict('This application is already decided or withdrawn.');
  await recordAuditEvent({ action: 'JOB_APPLICATION_WITHDRAWN', actor: me.userId, subject: a.id, organizationId: a.posting.organizationId, outcome: 'success', requestId: context.requestId });
  return { status: 'WITHDRAWN' as const };
}

// ---------------------------------------------------------------------------
// The employer's side of applications
// ---------------------------------------------------------------------------

export async function postingApplications(principal: Principal, postingId: string, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const posting = await db().jobPosting.findUnique({ where: { id: postingId }, include: { organization: { select: { id: true, name: true } }, district: { select: { name: true } } } });
  if (!posting || !can(me, READ_APPLICATIONS, { organizationId: posting.organizationId })) throw errors.notFound('Posting');
  const rows = await db().jobApplication.findMany({
    where: { postingId },
    orderBy: { createdAt: 'asc' },
    include: { applicant: { select: { displayName: true, email: true, phone: true } }, resumeFile: { select: { id: true, originalFilename: true, status: true } } },
  });
  await recordAuditEvent({ action: 'JOB_APPLICATIONS_VIEWED', actor: me.userId, subject: postingId, organizationId: posting.organizationId, outcome: 'success', requestId: context.requestId });
  return {
    posting,
    // A withdrawal takes back the contact details and the résumé.
    applications: rows.map((a) =>
      a.status === 'WITHDRAWN' ? { ...a, applicant: { displayName: a.applicant.displayName, email: null, phone: null }, resumeFile: null, coverNote: null } : a,
    ),
    canManage: can(me, MANAGE_APPLICATIONS, { organizationId: posting.organizationId }),
    canEdit: can(me, MANAGE, { organizationId: posting.organizationId }),
  };
}

export const actionSchema = z.object({
  action: z.enum(['SHORTLIST', 'INTERVIEW', 'OFFER', 'HIRE', 'REJECT', 'NOTE']),
  /** Shown to the applicant with the update. */
  message: z.string().trim().max(1000).optional(),
  /** Kept with the employer only. */
  employerNote: z.string().trim().max(2000).optional(),
  interviewAt: z.string().max(40).optional(),
});

const FROM: Readonly<Record<string, JobApplicationStatus[]>> = {
  SHORTLIST: ['SUBMITTED'],
  INTERVIEW: ['SUBMITTED', 'SHORTLISTED', 'INTERVIEW'],
  OFFER: ['SHORTLISTED', 'INTERVIEW'],
  HIRE: ['OFFERED'],
  REJECT: ['SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED'],
};
const TO: Readonly<Record<string, JobApplicationStatus>> = { SHORTLIST: 'SHORTLISTED', INTERVIEW: 'INTERVIEW', OFFER: 'OFFERED', HIRE: 'HIRED', REJECT: 'REJECTED' };

export async function actOnApplication(principal: Principal, applicationId: string, raw: z.input<typeof actionSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = parse(actionSchema, raw);
  const now = context.now ?? new Date();
  const a = await db().jobApplication.findUnique({ where: { id: applicationId }, include: { posting: { select: { id: true, title: true, organizationId: true, organization: { select: { name: true } } } } } });
  if (!a || !can(me, READ_APPLICATIONS, { organizationId: a.posting.organizationId })) throw errors.notFound('Application');
  if (!can(me, MANAGE_APPLICATIONS, { organizationId: a.posting.organizationId })) throw errors.forbidden(MANAGE_APPLICATIONS);

  if (input.action === 'NOTE') {
    await db().jobApplication.update({ where: { id: a.id }, data: { employerNote: input.employerNote || null } });
    return { status: a.status };
  }
  let interviewAt: Date | undefined;
  if (input.action === 'INTERVIEW') {
    interviewAt = input.interviewAt ? new Date(input.interviewAt) : undefined;
    if (!interviewAt || Number.isNaN(interviewAt.getTime()) || interviewAt <= now) throw errors.validation('Choose when the interview is, in the future.', { field: 'interviewAt' });
  }
  const to = TO[input.action]!;
  const moved = await db().jobApplication.updateMany({
    where: { id: a.id, status: { in: FROM[input.action]! } },
    data: { status: to, statusChangedAt: now, ...(interviewAt ? { interviewAt } : {}), ...(input.message !== undefined ? { messageToApplicant: input.message || null } : {}), ...(input.employerNote !== undefined ? { employerNote: input.employerNote || null } : {}) },
  });
  if (moved.count === 0) throw errors.conflict('This application has moved on. Refresh to see where it is.');
  await recordAuditEvent({ action: `JOB_APPLICATION_${to}`, actor: me.userId, subject: a.id, organizationId: a.posting.organizationId, outcome: 'success', requestId: context.requestId });
  const when = interviewAt ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(interviewAt) : '';
  const outcome: Record<string, string> = {
    SHORTLISTED: 'was shortlisted',
    INTERVIEW: `has an interview on ${when}`,
    OFFERED: 'led to an offer',
    HIRED: 'is marked hired — congratulations',
    REJECTED: 'was not taken forward',
  };
  await notifyUser({ userId: a.applicantUserId, notificationId: 'TL-NOTIF-APPLICATION-UPDATE-001', data: { title: a.posting.title, employer: a.posting.organization.name, outcome: outcome[to]! }, linkUrl: '/account/applications', requestId: context.requestId });
  return { status: to };
}

/** A job: close open postings whose closing date has passed. */
export async function closeExpiredPostings(now = new Date()) {
  const closed = await db().jobPosting.updateMany({ where: { status: 'OPEN', closesAt: { lte: now } }, data: { status: 'CLOSED', closedAt: now } });
  return { closed: closed.count };
}
