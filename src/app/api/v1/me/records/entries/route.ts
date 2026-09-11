/**
 * TL-API-MY-RECORD-ENTRY-ADD-001 — POST /api/v1/me/records/entries (multipart)
 *
 * The patient adds to their own record: a note, or an X-ray or report they
 * hold. Fields: kind, title, occurredOn, notes?, teeth?, dependentId?, file?.
 */

import { defineRoute } from '@/platform/http/handler';
import { addMyEntry } from '@/platform/records/service';
import { readEntryForm } from '@/platform/records/form';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-MY-RECORD-ENTRY-ADD-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'uploads',
  audit: true,
  handler: async ({ request, principal, ipAddress, requestId }) => {
    const { raw, file } = await readEntryForm(request);
    return addMyEntry(principal, raw, file, { ipAddress, requestId });
  },
});
