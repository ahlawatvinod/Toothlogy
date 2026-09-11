/**
 * TL-API-SERVICE-CONTRACTS-001        — GET  /api/v1/organizations/:id/service-contracts
 * TL-API-SERVICE-CONTRACT-PROPOSE-001 — POST /api/v1/organizations/:id/service-contracts
 *
 * A service business's maintenance contracts and the practices it may propose
 * to, and proposing one (tl.equipment.contract.manage on the business).
 */

import { contractProposalSchema, proposeContract, providerContracts } from '@/platform/equipment/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-SERVICE-CONTRACTS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return jsonSafe(await providerContracts(principal, params.id));
  },
});

export const POST = defineRoute({
  id: 'TL-API-SERVICE-CONTRACT-PROPOSE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: contractProposalSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return proposeContract(principal, params.id, body, { requestId });
  },
});
