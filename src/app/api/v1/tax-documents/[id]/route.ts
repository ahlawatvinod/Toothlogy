/**
 * TL-API-TAX-DOCUMENT-GET-001 — GET /api/v1/tax-documents/:id
 *
 * A tax invoice or credit note, for the order's buyer or the seller's people.
 * Anyone else is told it does not exist.
 */

import { getTaxDocument } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-TAX-DOCUMENT-GET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Tax document id is required.');
    return jsonSafe(await getTaxDocument(principal, params.id));
  },
});
