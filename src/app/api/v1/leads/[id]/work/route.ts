/**
 * TL-API-LEAD-WORK-001 — POST /api/v1/leads/:id/work
 *   { kind: ASSIGN, assigneeUserId } | { kind: CALL, outcome, note?, followUpAt? }
 *   | { kind: FOLLOW_UP, at, note? } | { kind: NOTE, note }
 *
 * Working a lead inside the practice: who has it, the calls made, the next
 * follow-up, notes. Only the lead's own practice; assigning needs the manage
 * permission, the rest may also be done by the assignee or the lead's dentist.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { leadWorkSchema, workOnLead } from '@/platform/leads/work';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-LEAD-WORK-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: leadWorkSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Lead id is required.');
    const lead = await workOnLead(principal, params.id, body, { requestId });
    return { leadId: lead.id, status: lead.status, assignedToUserId: lead.assignedToUserId, nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null };
  },
});
