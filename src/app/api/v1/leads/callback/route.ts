/**
 * TL-API-LEAD-CALLBACK-001 — POST /api/v1/leads/callback { practiceId, serviceOfferingId?, note? }
 *
 * "Please call me." Creates a lead that the qualification rule decides on.
 *
 * The reply says what actually happened to the request: delivered, waiting
 * to be passed on, merged with an earlier one, or not sent and why. It never
 * says "sent" for a request the practice has not received.
 */

function outcomeMessage(lead: { status: string; billingStatus: string; qualificationReason: string | null }): string {
  if (lead.status === 'DELIVERED') return 'Your request has been sent to the practice. They will contact you on your verified email or phone.';
  if (lead.status === 'DUPLICATE') return 'You asked this practice recently, and that request still stands, so this one was not sent again.';
  if (lead.status === 'NOT_QUALIFIED') return `Your request was not sent. ${lead.qualificationReason ?? ''}`.trim();
  return 'Your request is recorded but has not reached the practice yet. If you need care soon, call the clinic directly.';
}

import { defineRoute } from '@/platform/http/handler';
import { callbackSchema, requestCallback } from '@/platform/leads/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-LEAD-CALLBACK-001',
  permissions: ['tl.appointment.book.self'],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: callbackSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    const lead = await requestCallback(principal, body, { requestId });
    return { leadId: lead.id, status: lead.status, message: outcomeMessage(lead) };
  },
});
