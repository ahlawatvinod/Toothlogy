/**
 * TL-API-ENQUIRY-CREATE-001 — POST /api/v1/courses/:id/enquiries { consentToContact: true, message?, qualification?, examName?, examRank? }
 *
 * A student asks a college about a course. Signed in, email verified,
 * consent given; one open enquiry per course. Rate-limited as costly: it
 * notifies the college.
 */

import { createEnquiry, enquirySchema } from '@/platform/education/enquiries';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ENQUIRY-CREATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: enquirySchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Course id is required.');
    return createEnquiry(principal, params.id, body, { requestId });
  },
});
