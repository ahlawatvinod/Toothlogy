/**
 * TL-API-PUBLICATION-REMOVE-001 — DELETE /api/v1/me/academic/publications/:id
 *
 * Remove a publication from one's own profile; anyone else's does not exist.
 */

import { removePublication } from '@/platform/academic/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const DELETE = defineRoute({
  id: 'TL-API-PUBLICATION-REMOVE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, params, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Publication id is required.');
    await removePublication(principal, params.id, { requestId });
    return { removed: true };
  },
});
