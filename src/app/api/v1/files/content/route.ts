/**
 * TL-API-FILES-CONTENT-001 — GET /api/v1/files/content?k=&e=&s=
 *
 * Streams the bytes behind a signed URL. `permissions: []` because the
 * signature IS the authorization: it was minted only after the permission
 * check in TL-API-FILES-SIGN-001, it names one object, and it expires.
 *
 * Response headers are chosen for untrusted content: `nosniff`, a sandboxing
 * CSP, `no-store` caching, no referrer — so a stored file, whatever it turns
 * out to contain, cannot run script on the Toothlogy origin.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { verifySignature } from '@/platform/security/crypto';
import { signedUrlPayload } from '@/platform/storage/local-adapter';
import { readByStorageKey } from '@/platform/storage/files';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-FILES-CONTENT-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'downloads',
  audit: false,
  handler: async ({ url, ipAddress }) => {
    const key = url.searchParams.get('k');
    const expires = Number(url.searchParams.get('e'));
    const signature = url.searchParams.get('s');

    if (!key || !signature || !Number.isInteger(expires)) throw errors.notFound('File');
    if (!verifySignature(signedUrlPayload(key, expires), signature, 'signed-file-url')) {
      throw errors.notFound('File');
    }
    if (expires * 1000 < Date.now()) {
      throw errors.preconditionFailed('This link has expired. Open the file again from Toothlogy.');
    }

    const file = await readByStorageKey(key, { ipAddress });
    const inline = file.contentType.startsWith('image/') || file.contentType === 'application/pdf';
    const filename = (file.filename ?? 'download').replace(/[^\w.\- ]+/g, '_').slice(0, 120);

    return new Response(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(file.bytes.byteLength),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  },
});
