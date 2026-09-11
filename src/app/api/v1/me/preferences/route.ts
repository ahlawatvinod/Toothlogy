/**
 * TL-API-ME-PREFS-GET-001 — GET /api/v1/me/preferences
 * TL-API-ME-PREFS-PUT-001 — PUT /api/v1/me/preferences
 *
 * Language, timezone, country, display currency, theme and palette,
 * accessibility (reduced motion, contrast, text size), quiet hours and search
 * defaults. Self-scoped: the user id comes from the session only.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { getPreferences, preferencesSchema, updatePreferences } from '@/platform/users/preferences';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ME-PREFS-GET-001',
  permissions: ['tl.core.user.read.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return getPreferences(principal.userId);
  },
});

export const PUT = defineRoute({
  id: 'TL-API-ME-PREFS-PUT-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: preferencesSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return updatePreferences(principal.userId, body, { requestId });
  },
});
