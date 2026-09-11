/**
 * TL-API-ENTERPRISE-END-001 — POST /api/v1/admin/enterprise/:id/end  { reason }
 *
 * End a current enterprise agreement, with a reason. Tickets opened after it
 * carry no service levels.
 */

import { endAgreement, endSchema } from '@/platform/enterprise/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ENTERPRISE-END-001',
  permissions: ['tl.admin.enterprise.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: endSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Agreement id is required.');
    return endAgreement(principal, params.id, body, { requestId });
  },
});
