/**
 * TL-API-MY-RECORD-001 — GET /api/v1/me/records
 *
 * The patient's whole dental record: entries (theirs and every practice's),
 * prescriptions, who may see it, requests waiting, and who looked.
 */

import { defineRoute } from '@/platform/http/handler';
import { myRecord } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-MY-RECORD-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => myRecord(principal),
});
