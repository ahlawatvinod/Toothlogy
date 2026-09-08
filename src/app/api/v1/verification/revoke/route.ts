/**
 * TL-API-VERIFY-REVOKE-001 — POST /api/v1/verification/revoke
 *
 * Withdraw an approved verification.
 *
 * Behind a SEPARATE permission from review (`tl.verification.request.revoke`), held by
 * administrators and not by moderators. Revocation removes a live dentist from
 * patient search and cancels the trust signal patients rely on — a heavier
 * action than deciding a pending application, and one that should require a
 * deliberate grant.
 */

import { z } from 'zod';
import { revokeVerification } from '@/platform/verification/service';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  verificationRequestId: z.string().min(1),
  /**
   * A minimum length, because this record is the evidence if the decision is
   * ever challenged. "no" is not a reason anyone can review later.
   */
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters.').max(2000),
});

export const POST = defineRoute({
  id: 'TL-API-VERIFY-REVOKE-001',
  permissions: ['tl.verification.request.revoke'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    await revokeVerification(body.verificationRequestId, body.reason, principal.userId, {
      requestId,
    });

    return {
      revoked: true,
      message:
        'Verification withdrawn. The subject has been removed from patient search immediately.',
    };
  },
});
