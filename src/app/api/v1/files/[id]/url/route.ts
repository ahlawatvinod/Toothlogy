/**
 * TL-API-FILES-SIGN-001 — GET /api/v1/files/:id/url
 *
 * Mint a short-lived download URL after checking the caller may read the file.
 * Lifetime is by sensitivity: 60 seconds for clinical files (see
 * src/platform/storage/ports.ts). The URL is the only way to the bytes of a
 * private file, and minting one is recorded in the file's access log.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { createDownloadUrl } from '@/platform/storage/files';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-FILES-SIGN-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'downloads',
  audit: false,
  handler: async ({ principal, params, ipAddress }) => {
    if (typeof params.id !== 'string') throw errors.validation('File id is required.');
    return createDownloadUrl(principal, params.id, { ipAddress });
  },
});
