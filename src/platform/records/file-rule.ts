/**
 * A practice holding a patient's active record grant may open the files in
 * that patient's dental record — and only those: an identity document the
 * patient uploaded for something else stays theirs. Registered with the file
 * service, which asks every registered rule before refusing a read.
 */

import { db } from '../db/client';
import { can, isAuthenticated, type Principal } from '../rbac';
import type { FileRow } from '../storage/files';

const CLINICAL = new Set(['XRAY', 'CBCT', 'DENTAL_REPORT', 'PRESCRIPTION']);

export async function recordGrantReadRule(principal: Principal, file: FileRow): Promise<boolean> {
  if (!isAuthenticated(principal) || !file.ownerUserId || !CLINICAL.has(file.purpose)) return false;
  const organizationIds = principal.organizations
    .map((o) => o.organizationId)
    .filter((organizationId) => can(principal, 'tl.records.record.read', { organizationId }));
  if (organizationIds.length === 0) return false;
  const inRecord = await db().recordEntry.count({ where: { fileId: file.id, patientUserId: file.ownerUserId, deletedAt: null } });
  if (inRecord === 0) return false;
  const now = new Date();
  const grants = await db().recordAccessGrant.count({
    where: { patientUserId: file.ownerUserId, organizationId: { in: organizationIds }, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  });
  return grants > 0;
}
