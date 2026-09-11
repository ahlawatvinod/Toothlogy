/**
 * A record entry arrives as multipart/form-data: text fields plus, for an
 * X-ray or report, one file under `file`. The size is checked on the declared
 * size before the bytes are read; everything else about the file (sniffed
 * type, extension, scan, per-purpose limit) is the file service's to decide.
 */

import { errors } from '../kernel/errors';
import { PURPOSE_POLICY } from '../storage/files';
import type { entrySchema, UploadedBytes } from './service';
import type { z } from 'zod';

const MAX_BYTES = Math.max(PURPOSE_POLICY.XRAY.maxBytes, PURPOSE_POLICY.DENTAL_REPORT.maxBytes);

export async function readEntryForm(request: Request): Promise<{ raw: z.input<typeof entrySchema>; file?: UploadedBytes }> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw errors.validation('Send the form as multipart/form-data.');
  }
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' && value.trim() ? value : undefined;
  };
  const upload = form.get('file');
  let file: UploadedBytes | undefined;
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > MAX_BYTES) throw errors.validation(`That file is too large. The limit is ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`, { field: 'file' });
    file = { filename: upload.name || 'upload', declaredType: upload.type || 'application/octet-stream', bytes: new Uint8Array(await upload.arrayBuffer()) };
  }
  return {
    raw: {
      kind: (text('kind') ?? '') as z.input<typeof entrySchema>['kind'],
      title: text('title') ?? '',
      occurredOn: text('occurredOn') ?? '',
      notes: text('notes'),
      teeth: text('teeth'),
      dependentId: text('dependentId'),
      appointmentId: text('appointmentId'),
    },
    file,
  };
}
