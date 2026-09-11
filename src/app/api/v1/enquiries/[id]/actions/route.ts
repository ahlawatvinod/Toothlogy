/**
 * TL-API-ENQUIRY-ACTION-001 — POST /api/v1/enquiries/:id/actions
 *   { action: CONTACTED | APPLIED | ADMITTED | NOT_ADMITTED | LOST | WITHDRAW, note? }
 *   | { action: ASSIGN, assigneeUserId } | { action: NOTE, note } | { action: FOLLOW_UP, at }
 *
 * The college works the enquiry; the student may withdraw it. Anyone else is
 * told it does not exist.
 */

import { actOnEnquiry, enquiryActionSchema } from '@/platform/education/enquiries';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ENQUIRY-ACTION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: enquiryActionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Enquiry id is required.');
    const enquiry = await actOnEnquiry(principal, params.id, body, { requestId });
    return { enquiryId: enquiry.id, status: enquiry.status };
  },
});
