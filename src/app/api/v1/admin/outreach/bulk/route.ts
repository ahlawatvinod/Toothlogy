/**
 * TL-API-OUTREACH-BULK-001 — POST /api/v1/admin/outreach/bulk { districtId, purpose, assigneeUserIds[], dueAt?, limit? }
 *
 * Open a task for every subject in a district this purpose applies to that
 * has none open, shared round-robin between the chosen operators. Subjects
 * that already have an open task are skipped, so running it twice adds only
 * what is new.
 */

import { bulkCreateOutreach, bulkOutreachSchema } from '@/platform/operations/outreach';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-OUTREACH-BULK-001',
  permissions: ['tl.ops.outreach.manage'],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: bulkOutreachSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => bulkCreateOutreach(principal, body, { requestId }),
});
