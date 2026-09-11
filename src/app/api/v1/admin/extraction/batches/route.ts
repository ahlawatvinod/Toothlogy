/**
 * TL-API-EXTRACTION-BATCH-LIST-001   — GET  /api/v1/admin/extraction/batches
 * TL-API-EXTRACTION-BATCH-IMPORT-001 — POST /api/v1/admin/extraction/batches
 *
 * Import rows supplied by an operator (a directory export, a vendor file):
 * each kept as received, normalized, matched to a district, scored and
 * de-duplicated. Nothing imported is shown as verified.
 */

import { extractionBatchSchema, importExtractionBatch, listExtractionBatches } from '@/platform/india-data/extraction';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-EXTRACTION-BATCH-LIST-001',
  permissions: ['tl.data.extraction.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => jsonSafe({ batches: await listExtractionBatches(principal) }),
});

export const POST = defineRoute({
  id: 'TL-API-EXTRACTION-BATCH-IMPORT-001',
  permissions: ['tl.data.extraction.manage'],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: extractionBatchSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => importExtractionBatch(principal, body, { requestId }),
});
