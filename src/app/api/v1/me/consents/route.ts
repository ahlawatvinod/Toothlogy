/**
 * TL-API-ME-CONSENTS-GET-001 — GET  /api/v1/me/consents
 * TL-API-ME-CONSENTS-SET-001 — POST /api/v1/me/consents
 *
 * Marketing, analytics and AI-training consents. Append-only: revoking keeps
 * the record that consent was held until then (Constitution P4).
 */

import { z } from 'zod';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { CONSENT_PURPOSES, listConsents, setConsent } from '@/platform/users/preferences';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ME-CONSENTS-GET-001',
  permissions: ['tl.core.user.read.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return { consents: await listConsents(principal.userId) };
  },
});

export const POST = defineRoute({
  id: 'TL-API-ME-CONSENTS-SET-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: z.object({ purpose: z.enum(CONSENT_PURPOSES), granted: z.boolean() }),
  audit: true,
  handler: async ({ principal, body, ipAddress, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    await setConsent(principal.userId, body.purpose, body.granted, { ipAddress, requestId });
    return { consents: await listConsents(principal.userId) };
  },
});
