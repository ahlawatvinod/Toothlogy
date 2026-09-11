/**
 * An employer's members who may read applications may open the résumé an
 * applicant attached to an application to one of that employer's postings —
 * while the application stands. A withdrawal takes it back. Registered with
 * the file service.
 */

import { db } from '../db/client';
import { can, isAuthenticated, type Principal } from '../rbac';
import type { FileRow } from '../storage/files';

export async function resumeReadRule(principal: Principal, file: FileRow): Promise<boolean> {
  if (!isAuthenticated(principal) || file.purpose !== 'RESUME' || !file.ownerUserId) return false;
  const organizationIds = principal.organizations
    .map((o) => o.organizationId)
    .filter((organizationId) => can(principal, 'tl.careers.application.read', { organizationId }));
  if (organizationIds.length === 0) return false;
  const applications = await db().jobApplication.count({
    where: { resumeFileId: file.id, applicantUserId: file.ownerUserId, status: { not: 'WITHDRAWN' }, posting: { organizationId: { in: organizationIds } } },
  });
  return applications > 0;
}
