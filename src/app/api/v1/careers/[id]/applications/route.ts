/**
 * TL-API-APPLY-001 — POST /api/v1/careers/:id/applications (multipart)
 *
 * Fields: `consent` ("true"), `coverNote`?, `file`? (the résumé: PDF or Word).
 * Signed in with a verified email; once per posting. The résumé goes through
 * the file service (sniffed, scanned where configured) and belongs to the
 * applicant; the employer may open it while the application stands.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { PURPOSE_POLICY } from '@/platform/storage/files';
import { applyToPosting, type UploadedBytes } from '@/platform/careers/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-APPLY-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'uploads',
  audit: true,
  handler: async ({ request, principal, params, ipAddress, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Posting id is required.');
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw errors.validation('Send the application as multipart/form-data.');
    }
    const upload = form.get('file');
    let resume: UploadedBytes | undefined;
    if (upload instanceof File && upload.size > 0) {
      const max = PURPOSE_POLICY.RESUME.maxBytes;
      if (upload.size > max) throw errors.validation(`That file is too large. The limit is ${Math.round(max / 1024 / 1024)} MB.`, { field: 'file' });
      resume = { filename: upload.name || 'resume', declaredType: upload.type || 'application/octet-stream', bytes: new Uint8Array(await upload.arrayBuffer()) };
    }
    const note = form.get('coverNote');
    const consent = form.get('consent');
    return applyToPosting(principal, params.id, { coverNote: typeof note === 'string' && note.trim() ? note : undefined, consent: consent === 'true' || consent === 'on' }, resume, { ipAddress, requestId });
  },
});
