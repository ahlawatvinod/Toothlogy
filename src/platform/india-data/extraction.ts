/**
 * TOOTHLOGY INDIA DATA — extraction, review, pre-made accounts
 *
 * EXTRACT → NORMALIZE → DEDUPLICATE → REVIEW → PRE-MADE ACCOUNT → CLAIM / ACTIVATE
 *
 * An operator imports a batch of rows (a CSV export from a public directory,
 * or a vendor file). Every row is kept exactly as received, normalized beside
 * it, matched to a district, scored, and checked against what already exists
 * — earlier rows, accounts, dentists' registrations, organizations — so the
 * same person or place is never imported twice.
 *
 * Nothing extracted is ever shown as verified. A reviewer turns a row into a
 * pre-made account (an inactive dentist user with a draft, non-discoverable
 * profile) or an unowned listing (a clinic, hospital or college). A dentist
 * activates the account by proving both the email and the mobile on it; a
 * clinic claims its listing with evidence, through the existing claim review.
 *
 * Automatic extraction from external sources goes through the extractor port,
 * which is NOT_CONFIGURED; imports of supplied files work today.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { can, isAuthenticated, type Principal } from '../rbac';
import { matchDistrict } from './districts';
import { confidenceFor, dedupeKeyFor, normalizeRow, slugify, type ExtractionEntityKind } from './normalize';

const PERMISSION = 'tl.data.extraction.manage';

function operator(principal: Principal): string {
  if (!isAuthenticated(principal) || !can(principal, PERMISSION)) throw errors.forbidden(PERMISSION);
  return principal.userId;
}

export const extractionBatchSchema = z.object({
  source: z.string().trim().min(3, 'Name the source of the data.').max(120),
  sourceReference: z.string().trim().max(300).optional(),
  entityType: z.enum(['DENTIST', 'CLINIC', 'HOSPITAL', 'COLLEGE']),
  countryCode: z.string().length(2).default('IN'),
  /** Used for rows that do not name a district. */
  districtId: z.string().max(64).optional(),
  /** When the source captured the data; defaults to now. */
  extractedAt: z.string().datetime({ offset: true }).optional(),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).min(1).max(5000),
});

type Decision = { status: 'NEW' | 'DUPLICATE' | 'REJECTED'; duplicateOfId?: string | null; matchedUserId?: string | null; matchedOrganizationId?: string | null; reason?: string | null };

/** Does this row describe someone or something already on Toothlogy? */
async function existingMatch(entity: ExtractionEntityKind, fields: { phone: string | null; email: string | null; registrationNumber: string | null; name: string; districtId: string | null }): Promise<Decision | null> {
  const contact = [...(fields.email ? [{ email: fields.email }] : []), ...(fields.phone ? [{ phone: fields.phone }] : [])];
  if (entity === 'DENTIST') {
    if (contact.length > 0) {
      const user = await db().user.findFirst({ where: { OR: contact }, select: { id: true } });
      if (user) return { status: 'DUPLICATE', matchedUserId: user.id, reason: 'An account already has this email or mobile.' };
    }
    if (fields.registrationNumber) {
      const qualification = await db().qualification.findFirst({
        where: { registrationNumber: { equals: fields.registrationNumber, mode: 'insensitive' } },
        select: { dentistProfile: { select: { userId: true } } },
      });
      if (qualification) return { status: 'DUPLICATE', matchedUserId: qualification.dentistProfile.userId, reason: 'A dentist already holds this registration number.' };
    }
    return null;
  }
  const organization = await db().organization.findFirst({
    where: {
      deletedAt: null,
      OR: [
        ...contact,
        ...(fields.districtId ? [{ name: { equals: fields.name, mode: 'insensitive' as const }, locations: { some: { districtId: fields.districtId, deletedAt: null } } }] : []),
      ],
    },
    select: { id: true },
  });
  return organization ? { status: 'DUPLICATE', matchedOrganizationId: organization.id, reason: 'This organization is already listed.' } : null;
}

/** Import one batch. Returns counts; every row is recorded, including those rejected. */
export async function importExtractionBatch(principal: Principal, raw: z.input<typeof extractionBatchSchema>, context: { requestId?: string } = {}) {
  const actor = operator(principal);
  const input = extractionBatchSchema.parse(raw);
  if (input.districtId && !(await db().district.findUnique({ where: { id: input.districtId }, select: { id: true } }))) {
    throw errors.validation('That district does not exist.', { field: 'districtId' });
  }
  const now = new Date();
  const extractedAt = input.extractedAt ? new Date(input.extractedAt) : now;
  const batchId = newId('extractionBatch');
  const firstByKey = new Map<string, string>();
  const records: Prisma.ExtractedRecordCreateManyInput[] = [];

  for (const [index, row] of input.rows.entries()) {
    const n = normalizeRow(input.entityType, row);
    const problems = [...n.problems];
    const district = await matchDistrict(input.countryCode, n.stateName, n.districtName);
    if (n.districtName && !district) problems.push(`district “${n.districtName}”${n.stateName ? ` in ${n.stateName}` : ''} was not recognised`);
    const districtId = district?.id ?? input.districtId ?? null;
    const dedupeKey = dedupeKeyFor(input.entityType, { ...n, districtId });
    const id = newId('extractedRecord');

    let decision: Decision;
    if (n.name.length < 3) decision = { status: 'REJECTED', reason: 'No usable name.' };
    else if (firstByKey.has(dedupeKey)) decision = { status: 'DUPLICATE', duplicateOfId: firstByKey.get(dedupeKey)!, reason: 'Repeats an earlier row in this batch.' };
    else {
      const earlier = await db().extractedRecord.findFirst({ where: { dedupeKey, status: { not: 'REJECTED' } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      decision = earlier
        ? { status: 'DUPLICATE', duplicateOfId: earlier.id, reason: 'Already imported from an earlier batch.' }
        : ((await existingMatch(input.entityType, { ...n, districtId })) ?? { status: 'NEW' });
    }
    if (decision.status !== 'REJECTED' && !firstByKey.has(dedupeKey)) firstByKey.set(dedupeKey, id);

    records.push({
      id,
      batchId,
      entityType: input.entityType,
      rowNumber: index + 1,
      source: input.source,
      extractedAt,
      original: row as Prisma.InputJsonValue,
      normalized: { ...n, problems, districtId, districtName: district?.name ?? null } as unknown as Prisma.InputJsonValue,
      name: n.name || '(no name)',
      phone: n.phone,
      email: n.email,
      registrationNumber: n.registrationNumber,
      districtId,
      confidence: confidenceFor(input.entityType, { ...n, districtId }),
      dedupeKey,
      duplicateOfId: decision.duplicateOfId ?? null,
      status: decision.status,
      matchedUserId: decision.matchedUserId ?? null,
      matchedOrganizationId: decision.matchedOrganizationId ?? null,
      rejectionReason: decision.status === 'NEW' ? null : (decision.reason ?? null),
    });
  }

  const count = (s: string) => records.filter((r) => r.status === s).length;
  await transaction(async (tx) => {
    await tx.extractionBatch.create({
      data: {
        id: batchId,
        source: input.source,
        sourceReference: input.sourceReference ?? null,
        entityType: input.entityType,
        districtId: input.districtId ?? null,
        uploadedByUserId: actor,
        status: 'PROCESSED',
        totalRows: records.length,
        newRows: count('NEW'),
        duplicateRows: count('DUPLICATE'),
        rejectedRows: count('REJECTED'),
        processedAt: now,
      },
    });
    await tx.extractedRecord.createMany({ data: records });
  });
  await recordAuditEvent({ action: 'EXTRACTION_BATCH_IMPORTED', actor, subject: batchId, outcome: 'success', requestId: context.requestId, detail: { source: input.source, total: records.length, new: count('NEW'), duplicate: count('DUPLICATE'), rejected: count('REJECTED') } });
  return { batchId, total: records.length, new: count('NEW'), duplicate: count('DUPLICATE'), rejected: count('REJECTED') };
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export async function listExtractionBatches(principal: Principal) {
  operator(principal);
  return db().extractionBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { district: { select: { name: true } } } });
}

export async function listExtractedRecords(principal: Principal, filter: { status?: string; entityType?: string; districtId?: string; batchId?: string; limit?: number } = {}) {
  operator(principal);
  return db().extractedRecord.findMany({
    where: {
      ...(filter.status ? { status: filter.status as Prisma.EnumExtractedRecordStatusFilter['equals'] } : {}),
      ...(filter.entityType ? { entityType: filter.entityType as Prisma.EnumExtractionEntityFilter['equals'] } : {}),
      ...(filter.districtId ? { districtId: filter.districtId } : {}),
      ...(filter.batchId ? { batchId: filter.batchId } : {}),
    },
    include: { district: { select: { name: true, region: { select: { name: true } } } }, batch: { select: { source: true } } },
    orderBy: [{ status: 'asc' }, { confidence: 'desc' }, { createdAt: 'desc' }],
    take: Math.min(filter.limit ?? 200, 500),
  });
}

export const rejectRecordSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason.').max(300) });

export async function rejectExtractedRecord(principal: Principal, recordId: string, raw: z.input<typeof rejectRecordSchema>, context: { requestId?: string } = {}) {
  const actor = operator(principal);
  const { reason } = rejectRecordSchema.parse(raw);
  const claim = await db().extractedRecord.updateMany({
    where: { id: recordId, status: { in: ['NEW', 'DUPLICATE'] } },
    data: { status: 'REJECTED', rejectionReason: reason, reviewedByUserId: actor, reviewedAt: new Date() },
  });
  if (claim.count === 0) throw errors.preconditionFailed('Only a new or duplicate record can be rejected.');
  await recordAuditEvent({ action: 'EXTRACTED_RECORD_REJECTED', actor, subject: recordId, outcome: 'success', requestId: context.requestId, detail: { reason } });
}

function uniqueSlug(name: string): string {
  return `${slugify(name) || 'listing'}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Turn a reviewed record into a pre-made account (dentists) or an unowned
 * listing (clinics, hospitals, colleges). Once only: the record's status is
 * claimed first, and a matching account created meanwhile makes it fail
 * rather than create a second account.
 */
export async function createPremadeAccount(principal: Principal, recordId: string, context: { requestId?: string } = {}) {
  const actor = operator(principal);
  const record = await db().extractedRecord.findUnique({ where: { id: recordId }, include: { district: { select: { region: { select: { name: true } } } } } });
  if (!record) throw errors.notFound('Record');
  if (record.status !== 'NEW') throw errors.preconditionFailed(`A ${record.status.toLowerCase().replace('_', ' ')} record cannot become an account.`);
  const normalized = record.normalized as { address?: string | null; city?: string | null; pincode?: string | null; stateName?: string | null };
  if (record.entityType === 'DENTIST' && (!record.email || !record.phone)) {
    throw errors.preconditionFailed('A pre-made dentist account needs both an email address and a mobile number: activation proves both.');
  }
  const now = new Date();

  try {
    const created = await transaction(async (tx) => {
      const claim = await tx.extractedRecord.updateMany({ where: { id: recordId, status: 'NEW' }, data: { status: 'ACCOUNT_CREATED', reviewedByUserId: actor, reviewedAt: now } });
      if (claim.count === 0) throw errors.conflict('This record was handled at the same moment.');

      if (record.entityType === 'DENTIST') {
        const userId = newId('user');
        await tx.user.create({
          data: {
            id: userId,
            email: record.email,
            phone: record.phone,
            displayName: record.name,
            status: 'PENDING_ACTIVATION',
            locale: 'en-IN',
            countryCode: 'IN',
            timezone: 'Asia/Kolkata',
            roleAssignments: { create: { id: newId('roleAssignment'), roleKey: 'dentist' } },
            notificationPreferences: { create: (['IN_APP', 'EMAIL', 'PUSH', 'SMS'] as const).map((channel) => ({ id: newId('notificationPreference'), channel, enabled: true })) },
            profiles: { create: { id: newId('profile'), type: 'DENTIST', displayName: record.name } },
          },
        });
        await tx.dentistProfile.create({ data: { id: newId('profile'), userId, slug: uniqueSlug(record.name), status: 'DRAFT', languages: [], isDiscoverable: false } });
        await tx.extractedRecord.update({ where: { id: recordId }, data: { premadeUserId: userId } });
        return { kind: 'USER' as const, id: userId };
      }

      const organizationId = newId('organization');
      await tx.organization.create({
        data: {
          id: organizationId,
          type: record.entityType === 'HOSPITAL' ? 'HOSPITAL' : record.entityType === 'COLLEGE' ? 'COLLEGE' : 'CLINIC',
          name: record.name,
          slug: uniqueSlug(record.name),
          countryCode: 'IN',
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          status: 'PENDING',
          ownerUserId: null,
          phone: record.phone,
          email: record.email,
        },
      });
      const addressId = normalized.address ? newId('address') : null;
      if (addressId) {
        await tx.address.create({
          data: { id: addressId, lines: [normalized.address!], locality: normalized.city ?? null, postalCode: normalized.pincode ?? null, regionName: record.district?.region.name ?? normalized.stateName ?? null, countryCode: 'IN' },
        });
      }
      await tx.location.create({
        data: {
          id: newId('location'),
          organizationId,
          name: normalized.city ?? 'Main',
          slug: 'main',
          timezone: 'Asia/Kolkata',
          isPrimary: true,
          phone: record.phone,
          email: record.email,
          addressId,
          districtId: record.districtId,
        },
      });
      await tx.extractedRecord.update({ where: { id: recordId }, data: { premadeOrganizationId: organizationId } });
      return { kind: 'ORGANIZATION' as const, id: organizationId };
    });
    await recordAuditEvent({ action: 'PREMADE_ACCOUNT_CREATED', actor, subject: recordId, outcome: 'success', requestId: context.requestId, detail: { entityType: record.entityType, created: created.id } });
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw errors.conflict('An account with this email address or mobile number already exists. Mark this record as a duplicate instead.');
    }
    throw error;
  }
}

/** Per-district coverage for the district command centre and data review. */
export async function districtCoverage(principal: Principal, filter: { regionId?: string } = {}) {
  operator(principal);
  const rows = await db().extractedRecord.groupBy({
    by: ['districtId', 'entityType', 'status'],
    where: filter.regionId ? { district: { regionId: filter.regionId } } : {},
    _count: true,
  });
  return rows.map((r) => ({ districtId: r.districtId, entityType: r.entityType, status: r.status, count: r._count }));
}
