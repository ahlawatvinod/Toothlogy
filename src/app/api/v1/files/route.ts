/**
 * TL-API-FILES-UPLOAD-001 — POST /api/v1/files
 *
 * Upload one file as multipart/form-data: `file`, `purpose`, and optionally
 * `organizationId` for a file that belongs to an organization (which then
 * requires `tl.core.organization.manage` for that organization).
 *
 * Everything that decides whether the bytes may be stored — size, sniffed
 * type, extension, scan — lives in the file service, so an upload arriving by
 * any other path faces the same checks.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { PURPOSE_POLICY, uploadFile, type FilePurpose } from '@/platform/storage/files';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-FILES-UPLOAD-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'uploads',
  audit: true,
  handler: async ({ request, principal, ipAddress, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw errors.validation('Send the file as multipart/form-data.');
    }

    const file = form.get('file');
    if (!(file instanceof File)) throw errors.validation('Choose a file to upload.', { field: 'file' });

    const purpose = String(form.get('purpose') ?? '') as FilePurpose;
    const policy = PURPOSE_POLICY[purpose];
    if (!policy) throw errors.validation('Choose what this file is for.', { field: 'purpose' });

    // Checked on the declared size before the bytes are read into memory.
    if (file.size > policy.maxBytes) {
      throw errors.validation(`That file is too large. The limit is ${Math.round(policy.maxBytes / 1024 / 1024)} MB.`, {
        field: 'file',
      });
    }

    const organizationId = form.get('organizationId');

    return uploadFile({
      principal,
      purpose,
      filename: file.name || 'upload',
      declaredType: file.type || 'application/octet-stream',
      bytes: new Uint8Array(await file.arrayBuffer()),
      organizationId: typeof organizationId === 'string' && organizationId ? organizationId : undefined,
      ipAddress,
      requestId,
    });
  },
});
