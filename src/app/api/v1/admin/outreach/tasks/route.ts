/**
 * TL-API-OUTREACH-LIST-001   — GET  /api/v1/admin/outreach/tasks?scope=mine|unassigned|all&status=&districtId=&overdue=1
 * TL-API-OUTREACH-CREATE-001 — POST /api/v1/admin/outreach/tasks { extractedRecordId | organizationId, purpose, title?, assignedToUserId?, dueAt?, priority? }
 *
 * Operators see unassigned tasks and their own; "all" is for leads. One open
 * task per subject: a second is refused with a conflict.
 */

import { createOutreachSchema, createOutreachTask, listOutreachTasks } from '@/platform/operations/outreach';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

const SCOPES = ['mine', 'unassigned', 'all'] as const;
const STATUSES = ['OPEN', 'DONE', 'CANCELLED'] as const;

export const GET = defineRoute({
  id: 'TL-API-OUTREACH-LIST-001',
  permissions: ['tl.ops.outreach.work'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, url }) => {
    const p = url.searchParams;
    const scope = SCOPES.find((s) => s === p.get('scope'));
    const status = STATUSES.find((s) => s === p.get('status'));
    const tasks = await listOutreachTasks(principal, { scope, status, districtId: p.get('districtId') ?? undefined, overdue: p.get('overdue') === '1' });
    return { tasks };
  },
});

export const POST = defineRoute({
  id: 'TL-API-OUTREACH-CREATE-001',
  permissions: ['tl.ops.outreach.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: createOutreachSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => createOutreachTask(principal, body, { requestId }),
});
