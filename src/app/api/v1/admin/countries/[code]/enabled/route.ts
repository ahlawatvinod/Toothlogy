/**
 * TL-API-COUNTRY-SWITCH-001 — POST /api/v1/admin/countries/:code/enabled { enabled, reason }
 *
 * Open a country for onboarding (only when every readiness check passes) or
 * close it to new organizations. Audited with the reason.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { setCountryEnabled, switchSchema } from '@/platform/globalization/countries';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-COUNTRY-SWITCH-001',
  permissions: ['tl.admin.country.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: switchSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.code !== 'string') throw errors.validation('Country code is required.');
    return setCountryEnabled(principal, params.code, body, { requestId });
  },
});
