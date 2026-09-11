/**
 * TL-API-ORG-VERIFY-HISTORY-001 — GET  /api/v1/organizations/:id/verification
 * TL-API-ORG-VERIFY-SUBMIT-001  — POST /api/v1/organizations/:id/verification
 *
 * Submit a clinic, hospital, college or supplier for verification with
 * evidence, and read its verification history (decision reasons included,
 * reviewer notes never).
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import {
  organizationVerificationHistory,
  organizationVerificationSchema,
  submitOrganizationVerification,
} from '@/platform/organizations/management';

export const dynamic = 'force-dynamic';

const scope = ({ params }: { params: Record<string, string | string[] | undefined> }) => ({
  organizationId: typeof params.id === 'string' ? params.id : undefined,
});

export const GET = defineRoute({
  id: 'TL-API-ORG-VERIFY-HISTORY-001',
  permissions: ['tl.core.organization.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: scope,
  audit: false,
  handler: async ({ params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return { history: await organizationVerificationHistory(params.id) };
  },
});

export const POST = defineRoute({
  id: 'TL-API-ORG-VERIFY-SUBMIT-001',
  permissions: ['tl.core.organization.manage'],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: organizationVerificationSchema,
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (!isAuthenticated(principal) || typeof params.id !== 'string') throw errors.unauthenticated();
    const result = await submitOrganizationVerification(params.id, principal.userId, body, { requestId });
    return {
      ...result,
      message: 'Submitted. A reviewer will check the documents against the issuing register.',
    };
  },
});
