/**
 * TL-API-CAMP-CONSOLE-001 — GET   /api/v1/camps/:id
 * TL-API-CAMP-UPDATE-001  — PATCH /api/v1/camps/:id
 *
 * The camp's working view (organizer, staff, the camp's doctors) with its
 * doctors, patients and numbers; changing a draft or rejected camp.
 */

import { campConsole, campUpdateSchema, updateCamp } from '@/platform/camps/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-CAMP-CONSOLE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Camp id is required.');
    return campConsole(principal, params.id);
  },
});

export const PATCH = defineRoute({
  id: 'TL-API-CAMP-UPDATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: campUpdateSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Camp id is required.');
    await updateCamp(principal, params.id, body, { requestId });
    return { campId: params.id };
  },
});
