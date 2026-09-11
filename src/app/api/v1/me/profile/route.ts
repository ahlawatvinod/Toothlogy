/**
 * TL-API-ME-PROFILE-001 — PATCH /api/v1/me/profile
 *
 * Display name and profile photo. The photo must be the caller's own ACTIVE
 * avatar upload — another user's file id, or a document, is refused.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { profileSchema, updateProfile } from '@/platform/users/preferences';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  id: 'TL-API-ME-PROFILE-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: profileSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return updateProfile(principal.userId, body, { requestId });
  },
});
