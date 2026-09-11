/**
 * TL-API-ENTERPRISE-LIST-001   — GET  /api/v1/admin/enterprise
 * TL-API-ENTERPRISE-RECORD-001 — POST /api/v1/admin/enterprise
 *
 * Enterprise agreements for staff (tl.admin.enterprise.manage): every
 * agreement with its service-level results, residency and sign-on status;
 * and recording one from the signed contract.
 */

import { agreementSchema, enterpriseAdmin, recordAgreement } from '@/platform/enterprise/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ENTERPRISE-LIST-001',
  permissions: ['tl.admin.enterprise.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => jsonSafe(await enterpriseAdmin(principal)),
});

export const POST = defineRoute({
  id: 'TL-API-ENTERPRISE-RECORD-001',
  permissions: ['tl.admin.enterprise.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: agreementSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => recordAgreement(principal, body, { requestId }),
});
