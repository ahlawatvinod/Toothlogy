/**
 * TL-API-MY-ACADEMIC-001      — GET  /api/v1/me/academic
 * TL-API-ACADEMIC-PROFILE-001 — POST /api/v1/me/academic { type: RESEARCHER | FACULTY, displayName, … }
 *
 * The signed-in person's researcher and faculty profiles, with publications
 * and faculty posts; creating or updating one of them.
 */

import { academicProfileSchema, myAcademic, upsertAcademicProfile } from '@/platform/academic/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-MY-ACADEMIC-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => ({ profiles: await myAcademic(principal) }),
});

export const POST = defineRoute({
  id: 'TL-API-ACADEMIC-PROFILE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: academicProfileSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => upsertAcademicProfile(principal, body, { requestId }),
});
