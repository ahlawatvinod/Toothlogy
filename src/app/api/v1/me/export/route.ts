/**
 * TL-API-ME-EXPORT-001 — GET /api/v1/me/export
 *
 * Download everything Toothlogy holds about the caller as a JSON file. Audited
 * (it is a bulk read of personal data) and rate limited as costly.
 */

import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/envelope';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { exportUserData } from '@/platform/users/export';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ME-EXPORT-001',
  permissions: ['tl.core.user.read.self'],
  authRequired: true,
  rateLimit: 'costly',
  audit: true,
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const data = await exportUserData(principal.userId);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(jsonSafe(data), null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="toothlogy-export-${date}.json"`,
        'Cache-Control': 'private, no-store',
      },
    });
  },
});
