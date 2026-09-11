/**
 * TL-API-ME-NOTIFPREFS-GET-001 — GET /api/v1/me/notification-preferences
 * TL-API-ME-NOTIFPREFS-PUT-001 — PUT /api/v1/me/notification-preferences
 *
 * The category × channel matrix. Categories whose notifications are all
 * transactional are reported `locked` — they are delivered regardless, and a
 * switch that pretended otherwise would be a lie.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import {
  getNotificationPreferences,
  notificationPreferenceSchema,
  setNotificationPreference,
} from '@/platform/users/preferences';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ME-NOTIFPREFS-GET-001',
  permissions: ['tl.core.user.read.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return { categories: await getNotificationPreferences(principal.userId) };
  },
});

export const PUT = defineRoute({
  id: 'TL-API-ME-NOTIFPREFS-PUT-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: notificationPreferenceSchema,
  audit: true,
  handler: async ({ principal, body }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    await setNotificationPreference(principal.userId, body);
    return { categories: await getNotificationPreferences(principal.userId) };
  },
});
