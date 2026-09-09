/**
 * TL-API-PRICELIST-ME-GET-001 — GET /api/v1/dentists/me/price-list
 * TL-API-PRICELIST-ME-PUT-001 — PUT /api/v1/dentists/me/price-list
 *
 * A dentist's own price list.
 *
 * Scoped to `self` throughout. The dentist profile is resolved from the session
 * inside the service layer, and neither route accepts a dentist id — so there
 * is no id to tamper with and no IDOR to write (specification §22).
 *
 * `locationId` IS accepted, because a dentist legitimately has several clinics.
 * It is checked against their CONFIRMED practices before anything is written,
 * so it cannot be used to publish prices against a clinic they do not work at.
 */

import { z } from 'zod';
import {
  listOwnPriceList,
  servicePriceInputSchema,
  upsertServicePrice,
} from '@/platform/pricing/service';
import { describePrice } from '@/platform/pricing/display';
import { describeSuggestedRange } from '@/platform/pricing/display';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';
import { optionalMinorAmountSchema } from '@/platform/pricing/validation';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-PRICELIST-ME-GET-001',
  permissions: ['tl.dentist.pricing.manage.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, url }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    // Absent means every scope; an explicit empty value means the global list.
    const locationParam = url.searchParams.get('locationId');
    const locationId =
      locationParam === null ? undefined : locationParam === '' ? null : locationParam;

    const rows = await listOwnPriceList(principal.userId, { locationId });

    return {
      rows: rows.map((row) => ({
        id: row.id,
        service: {
          slug: row.service.slug,
          name: row.service.name,
          categoryName: row.service.category.name,
          categorySlug: row.service.category.slug,
          isPackage: row.service.isPackage,
        },
        location: row.location ? { id: row.location.id, name: row.location.name } : null,
        isEnabled: row.isEnabled,
        isPublicVisible: row.isPublicVisible,
        note: row.note,
        // The market reference, kept beside the dentist's own figure and always
        // labelled — never merged into it.
        suggested: describeSuggestedRange({
          minMinor: row.service.suggestedMinMinor,
          maxMinor: row.service.suggestedMaxMinor,
          currency: row.service.suggestedCurrency ?? 'INR',
          openEnded: row.service.suggestedIsOpenEnded,
          isCustomQuote: row.service.isCustomQuote,
        }),
        variants: row.variantPrices.map((price) => ({
          id: price.id,
          variantSlug: price.variant?.slug ?? null,
          variantName: price.variant?.name ?? null,
          unit: price.unit.key,
          unitLabel: price.unit.shortLabel,
          currency: price.currency,
          isCustomQuote: price.isCustomQuote,
          isEnabled: price.isEnabled,
          // Raw minor units as strings, so a client can edit them without ever
          // parsing the rendered string back apart.
          amounts: {
            minMinor: price.minMinor?.toString() ?? null,
            maxMinor: price.maxMinor?.toString() ?? null,
            actualMinor: price.actualMinor?.toString() ?? null,
            discountedMinor: price.discountedMinor?.toString() ?? null,
            packageMinor: price.packageMinor?.toString() ?? null,
            additionalMinor: price.additionalMinor?.toString() ?? null,
          },
          display: describePrice({
            minMinor: price.minMinor,
            maxMinor: price.maxMinor,
            actualMinor: price.actualMinor,
            discountedMinor: price.discountedMinor,
            packageMinor: price.packageMinor,
            currency: price.currency,
            isCustomQuote: price.isCustomQuote,
            unitLabel: price.unit.shortLabel,
          }),
        })),
      })),
    };
  },
});

const putSchema = servicePriceInputSchema.extend({
  variants: z
    .array(
      servicePriceInputSchema.shape.variants.element
        .omit({
          minMinor: true,
          maxMinor: true,
          actualMinor: true,
          discountedMinor: true,
          packageMinor: true,
          additionalMinor: true,
        })
        .extend({
          minMinor: optionalMinorAmountSchema,
          maxMinor: optionalMinorAmountSchema,
          actualMinor: optionalMinorAmountSchema,
          discountedMinor: optionalMinorAmountSchema,
          packageMinor: optionalMinorAmountSchema,
          additionalMinor: optionalMinorAmountSchema,
        }),
    )
    .min(1)
    .max(40),
});

export const PUT = defineRoute({
  id: 'TL-API-PRICELIST-ME-PUT-001',
  permissions: ['tl.dentist.pricing.manage.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: putSchema as unknown as z.ZodType<z.infer<typeof putSchema>>,
  handler: async ({ body, principal, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const result = await upsertServicePrice(principal.userId, body, {
      userId: principal.userId,
      requestId,
    });

    return result;
  },
});
