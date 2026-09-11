/**
 * TL-API-ORG-LOCHOURS-001 — PUT /api/v1/organizations/:id/locations/:locationId/hours
 *
 * Replace a branch's weekly opening hours. A day with no entries is closed;
 * a day may have split sessions (morning and evening), which Indian clinics
 * commonly keep.
 */

import { z } from 'zod';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { businessHoursSchema } from '@/platform/organizations/locations';
import { setLocationHours } from '@/platform/organizations/location-management';

export const dynamic = 'force-dynamic';

export const PUT = defineRoute({
  id: 'TL-API-ORG-LOCHOURS-001',
  permissions: ['tl.core.organization.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: z.object({ hours: z.array(businessHoursSchema).max(21) }),
  resolveScope: ({ params }) => ({ organizationId: typeof params.id === 'string' ? params.id : undefined }),
  audit: true,
  handler: async ({ principal, params, body }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    if (typeof params.id !== 'string' || typeof params.locationId !== 'string') {
      throw errors.validation('Organization and location ids are required.');
    }
    await setLocationHours(params.id, params.locationId, body.hours, principal.userId);
    return { updated: true, days: new Set(body.hours.map((h) => h.dayOfWeek)).size };
  },
});
