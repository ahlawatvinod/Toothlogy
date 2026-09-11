/**
 * TL-API-OPS-COMMAND-001 — GET /api/v1/admin/operations?regionId=
 *
 * The district command centre: per district, records, pre-made accounts,
 * activations, listings and claims, live clinics, 30-day leads and bookings,
 * open and overdue outreach; per operator, open, overdue and finished work
 * and calls in the last 7 days. Counted from the rows, never cached.
 */

import { commandCenter } from '@/platform/operations/command-center';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-OPS-COMMAND-001',
  permissions: ['tl.ops.outreach.work'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, url }) => commandCenter(principal, { regionId: url.searchParams.get('regionId') ?? undefined }),
});
