/**
 * TL-API-EXTRACTED-RECORD-LIST-001 — GET /api/v1/admin/extraction/records?status=&entityType=&districtId=&batchId=
 *
 * The review queue: records with their original and normalized data, source,
 * district, confidence, duplicate links and UNVERIFIED state.
 */

import { listExtractedRecords } from '@/platform/india-data/extraction';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-EXTRACTED-RECORD-LIST-001',
  permissions: ['tl.data.extraction.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, url }) => {
    const p = url.searchParams;
    return jsonSafe({
      records: await listExtractedRecords(principal, {
        status: p.get('status') ?? undefined,
        entityType: p.get('entityType') ?? undefined,
        districtId: p.get('districtId') ?? undefined,
        batchId: p.get('batchId') ?? undefined,
      }),
    });
  },
});
