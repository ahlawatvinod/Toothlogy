/**
 * TL-API-COMMUNITY-ACCEPT-001 — POST /api/v1/community/questions/:id/accept { answerId | null }
 *
 * The asker marks the answer that helped, or clears it.
 */

import { z } from 'zod';
import { acceptAnswer } from '@/platform/community/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ answerId: z.string().max(64).nullable() });

export const POST = defineRoute({
  id: 'TL-API-COMMUNITY-ACCEPT-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Question id is required.');
    await acceptAnswer(principal, params.id, body.answerId, { requestId });
    return { acceptedAnswerId: body.answerId };
  },
});
