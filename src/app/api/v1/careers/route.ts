/**
 * TL-API-CAREERS-LIST-001 — GET /api/v1/careers?q=&kind=&role=&districtId=&page=
 *
 * Open jobs and internships, newest first. Public.
 */

import { defineRoute } from '@/platform/http/handler';
import { listPostings } from '@/platform/careers/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-CAREERS-LIST-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ request }) => {
    const p = new URL(request.url).searchParams;
    return listPostings({
      q: p.get('q') || undefined,
      kind: (p.get('kind') || undefined) as never,
      role: (p.get('role') || undefined) as never,
      districtId: p.get('districtId') || undefined,
      page: p.get('page') || undefined,
    });
  },
});
