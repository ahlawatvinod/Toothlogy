/**
 * TL-API-LEAD-LIST-001 — GET /api/v1/organizations/:id/leads?status=
 *
 * An organization's leads and their statistics. A callback patient's contact
 * details appear only once the lead is paid for.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { jsonSafe } from '@/platform/http/serialize';
import { leadStats, listLeads } from '@/platform/leads/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-LEAD-LIST-001',
  permissions: ['tl.leads.lead.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: ({ params }) => ({ organizationId: typeof params.id === 'string' ? params.id : undefined }),
  audit: false,
  handler: async ({ principal, params, url }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    const [leads, stats] = await Promise.all([
      listLeads(principal, params.id, { status: url.searchParams.get('status') ?? undefined }),
      leadStats(principal, params.id),
    ]);
    return jsonSafe({ leads, stats });
  },
});
