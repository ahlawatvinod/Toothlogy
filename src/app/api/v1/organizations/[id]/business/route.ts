/**
 * TL-API-BUSINESS-PROFILE-001 — PATCH /api/v1/organizations/:id/business
 *
 * A dental business's trading profile and the districts it serves. Checks
 * tl.marketplace.catalogue.manage on the business.
 */

import { businessProfileSchema, upsertBusinessProfile } from '@/platform/marketplace/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  id: 'TL-API-BUSINESS-PROFILE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: businessProfileSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    const profile = await upsertBusinessProfile(principal, params.id, body, { requestId });
    return { organizationId: profile.organizationId, serviceAreas: profile.serviceAreas.length };
  },
});
