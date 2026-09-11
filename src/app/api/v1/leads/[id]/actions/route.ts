/**
 * TL-API-LEAD-ACTION-001 — POST /api/v1/leads/:id/actions { action, reason? }
 *
 * Accept, decline, contacted, appointment, converted, lost — each only from
 * the states it makes sense from, and only by the lead's own practice.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { actOnLead, leadActionSchema } from '@/platform/leads/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-LEAD-ACTION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: leadActionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Lead id is required.');
    const lead = await actOnLead(principal, params.id, body, { requestId });
    return { leadId: lead.id, status: lead.status };
  },
});
