/**
 * TL-API-OUTREACH-TASK-ACTION-001 — POST /api/v1/admin/outreach/tasks/:id
 *   { op: LOG, type, outcome?, note?, nextDueAt? }
 *   | { op: CLOSE, action: COMPLETE | CANCEL, outcome?, note? }
 *   | { op: ASSIGN, assignedToUserId }
 *   | { op: INVITE }
 *
 * Work on one outreach task. Logging on an unassigned task takes it;
 * cancelling and assigning others are for leads; an invitation is refused
 * while email and SMS are not configured.
 */

import { z } from 'zod';
import { assignOutreachTask, closeOutreachTask, logOutreachActivity, sendActivationInvite } from '@/platform/operations/outreach';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

// Each operation validates its own fields in the service.
const bodySchema = z.object({ op: z.enum(['LOG', 'CLOSE', 'ASSIGN', 'INVITE']) }).passthrough();

export const POST = defineRoute({
  id: 'TL-API-OUTREACH-TASK-ACTION-001',
  permissions: ['tl.ops.outreach.work'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Task id is required.');
    const { op, ...rest } = body;
    const context = { requestId };
    if (op === 'LOG') return logOutreachActivity(principal, params.id, rest as never, context);
    if (op === 'CLOSE') return closeOutreachTask(principal, params.id, rest as never, context);
    if (op === 'ASSIGN') return assignOutreachTask(principal, params.id, rest as never, context);
    return sendActivationInvite(principal, params.id, context);
  },
});
