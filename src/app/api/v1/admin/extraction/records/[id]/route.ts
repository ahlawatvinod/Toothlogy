/**
 * TL-API-EXTRACTED-RECORD-ACTION-001 — POST /api/v1/admin/extraction/records/:id { action: PREMADE | REJECT, reason? }
 *
 * PREMADE turns a new record into an inactive pre-made dentist account (email
 * and mobile required, for activation) or an unowned clinic, hospital or
 * college listing. REJECT records why the row is not used. Each happens once.
 */

import { z } from 'zod';
import { createPremadeAccount, rejectExtractedRecord } from '@/platform/india-data/extraction';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

const actionSchema = z.object({ action: z.enum(['PREMADE', 'REJECT']), reason: z.string().trim().max(300).optional() });

export const POST = defineRoute({
  id: 'TL-API-EXTRACTED-RECORD-ACTION-001',
  permissions: ['tl.data.extraction.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: actionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Record id is required.');
    if (body.action === 'REJECT') {
      await rejectExtractedRecord(principal, params.id, { reason: body.reason ?? '' }, { requestId });
      return { status: 'REJECTED' };
    }
    return createPremadeAccount(principal, params.id, { requestId });
  },
});
