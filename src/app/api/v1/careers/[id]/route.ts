/**
 * TL-API-CAREERS-GET-001 — GET /api/v1/careers/:id
 *
 * An open posting, or a closed or filled one marked not accepting. Drafts do
 * not exist here.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { getPosting } from '@/platform/careers/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-CAREERS-GET-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Posting id is required.');
    const posting = await getPosting(params.id);
    if (!posting) throw errors.notFound('Posting');
    return posting;
  },
});
