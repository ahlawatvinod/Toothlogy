/**
 * TL-API-PRACTICE-RECORD-ENTRY-ADD-001 — POST /api/v1/organizations/:id/patients/:userId/record/entries (multipart)
 *
 * The practice adds to a patient's record under a grant that allows adding.
 * The file belongs to the patient.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { addPracticeEntry } from '@/platform/records/service';
import { readEntryForm } from '@/platform/records/form';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-PRACTICE-RECORD-ENTRY-ADD-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'uploads',
  audit: true,
  handler: async ({ request, principal, params, ipAddress, requestId }) => {
    if (typeof params.id !== 'string' || typeof params.userId !== 'string') throw errors.validation('Organization and patient are required.');
    const { raw, file } = await readEntryForm(request);
    return addPracticeEntry(principal, params.id, params.userId, raw, file, { ipAddress, requestId });
  },
});
