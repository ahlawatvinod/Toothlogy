/**
 * TL-API-FILES-PUBLIC-001 — GET /api/v1/files/:id/public
 *
 * Streams a PUBLIC file — a clinic photo, an organization logo, a profile
 * photo on a public profile — without a signature, so it can sit in an
 * <img src>. Anything not PUBLIC answers 404 here regardless of who asks:
 * sensitivity is decided by the file's purpose at upload, never by a caller.
 *
 * Files are immutable once stored (a new upload is a new id), so the response
 * is cacheable forever.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { readPublicFile } from '@/platform/storage/files';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-FILES-PUBLIC-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'downloads',
  audit: false,
  handler: async ({ params }) => {
    if (typeof params.id !== 'string') throw errors.notFound('File');
    const file = await readPublicFile(params.id);
    return new Response(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(file.bytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
});
