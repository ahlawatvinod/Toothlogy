/**
 * TL-API-FILES-GET-001    — GET    /api/v1/files/:id
 * TL-API-FILES-DELETE-001 — DELETE /api/v1/files/:id
 *
 * A file the caller may read or manage. An unreadable file answers 404, not
 * 403, so file ids cannot be probed for existence.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { deleteFile, getFileMetadata } from '@/platform/storage/files';

export const dynamic = 'force-dynamic';

const fileId = (params: Record<string, string | string[] | undefined>) => {
  if (typeof params.id !== 'string') throw errors.validation('File id is required.');
  return params.id;
};

export const GET = defineRoute({
  id: 'TL-API-FILES-GET-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => getFileMetadata(principal, fileId(params)),
});

export const DELETE = defineRoute({
  id: 'TL-API-FILES-DELETE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, params, ipAddress, requestId }) => {
    const result = await deleteFile(principal, fileId(params), { ipAddress, requestId });
    return {
      deleted: true,
      // Honest: some documents must be kept for a statutory period after the
      // owner deletes them. They are hidden immediately and purged afterwards.
      bytesRemovedAfter: result.retainUntil,
    };
  },
});
