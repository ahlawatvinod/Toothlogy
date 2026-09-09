/**
 * TL-API-CATALOGUE-SERVICE-PUT-001 — PUT /api/v1/catalogue/services
 *
 * Create or edit a master treatment. Staff-only.
 *
 * Separate from the dentist pricing endpoints on purpose: a dentist who could
 * reach this could move the suggested range their own price is compared
 * against, which would make the comparison meaningless (specification §10).
 */

import { z } from 'zod';
import { serviceInputSchema, upsertService } from '@/platform/catalogue/service';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';
import { minorAmountSchema } from '@/platform/pricing/validation';

export const dynamic = 'force-dynamic';

/**
 * Amounts arrive as strings and become bigints here.
 *
 * A JSON number is an IEEE double. Money must never travel through a type that
 * cannot represent every integer exactly (Constitution §4).
 */
const bodySchema = serviceInputSchema
  .omit({ suggestedMinMinor: true, suggestedMaxMinor: true })
  .extend({
    suggestedMinMinor: minorAmountSchema.optional(),
    suggestedMaxMinor: minorAmountSchema.optional(),
  });

export const PUT = defineRoute({
  id: 'TL-API-CATALOGUE-SERVICE-PUT-001',
  permissions: ['tl.clinic.catalogue.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: bodySchema as unknown as z.ZodType<z.infer<typeof bodySchema>>,
  handler: async ({ body, principal, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const service = await upsertService(body, { userId: principal.userId, requestId });

    return { service: { slug: service.slug, name: service.name, status: service.status } };
  },
});
