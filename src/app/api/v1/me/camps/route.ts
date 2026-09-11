/**
 * TL-API-MY-CAMPS-001 — GET /api/v1/me/camps
 *
 * Participation history: camps the signed-in person organized, served at
 * and attended, with any referral from their visit.
 */

import { myCamps } from '@/platform/camps/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-MY-CAMPS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => myCamps(principal),
});
