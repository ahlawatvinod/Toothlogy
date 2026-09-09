/**
 * TL-API-PRICELIST-PUBLIC-001 — GET /api/v1/dentists/:slug/price-list
 *
 * A dentist's published prices, as a patient sees them.
 *
 * PUBLIC, AND DELIBERATELY NARROW.
 * `permissions: []` is a decision (Constitution §9): transparent pricing is the
 * point of the TRUST pillar. But this route returns only what a patient may
 * see, and three conditions must all hold — the dentist is discoverable, the
 * row is enabled, and the row is published. Internal fields, draft catalogue
 * entries, disabled rows and price history are not reachable here.
 *
 * An undiscoverable dentist returns 404 rather than an empty list, so the route
 * cannot be used to confirm that an unverified profile exists.
 */

import { listPublicPriceList } from '@/platform/pricing/service';
import { describePrice, describeSuggestedRange } from '@/platform/pricing/display';
import { resolvePriceList } from '@/platform/pricing/resolution';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-PRICELIST-PUBLIC-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ params, url }) => {
    const slug = params.slug;
    if (typeof slug !== 'string') throw errors.notFound('Dentist');

    const locationId = url.searchParams.get('locationId') ?? undefined;
    const result = await listPublicPriceList(slug, locationId);
    if (!result) throw errors.notFound('Dentist');

    // Collapse a global row and a clinic override for the same treatment into
    // one entry. Without this the same crown appears twice at two prices.
    const resolved = resolvePriceList(result.rows, locationId ?? null);

    const entries = [...resolved.values()]
      .filter((entry) => entry.row !== null)
      .map((entry) => {
        const row = entry.row!;
        return {
          service: {
            slug: row.service.slug,
            name: row.service.name,
            categoryName: row.service.category.name,
            patientDescription: row.service.patientDescription,
          },
          // Which of the three sources this price came from, so a client can
          // label it honestly rather than guessing.
          priceSource: entry.source,
          clinic: row.location ? { id: row.location.id, name: row.location.name } : null,
          note: row.note,
          suggested: describeSuggestedRange({
            minMinor: row.service.suggestedMinMinor,
            maxMinor: row.service.suggestedMaxMinor,
            currency: row.service.suggestedCurrency ?? 'INR',
            openEnded: row.service.suggestedIsOpenEnded,
            isCustomQuote: row.service.isCustomQuote,
          }),
          prices: row.variantPrices
            .filter((price) => price.isEnabled)
            .map((price) => ({
              variantName: price.variant?.name ?? null,
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
        };
      })
      .filter((entry) => entry.prices.length > 0);

    return {
      dentist: { slug: result.profile.slug },
      entries,
    };
  },
});
