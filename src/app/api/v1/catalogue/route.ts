/**
 * TL-API-CATALOGUE-LIST-001 — GET /api/v1/catalogue
 *
 * The master treatment catalogue, grouped by category.
 *
 * PUBLIC ON PURPOSE. `permissions: []` is a decision, not an omission
 * (Constitution §9): the list of dental treatments that exist, and what they
 * typically cost in this market, is exactly the information the DISCOVER pillar
 * is meant to surface. Nothing dentist-specific is reachable here.
 *
 * `?includeHidden=1` needs the catalogue read permission and is refused
 * without it, so draft entries stay invisible to the public route.
 */

import { listCatalogue, listPriceUnits } from '@/platform/catalogue/service';
import { describeSuggestedRange } from '@/platform/pricing/display';
import { defineRoute } from '@/platform/http/handler';
import { can } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-CATALOGUE-LIST-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ url, principal }) => {
    const includeHidden = url.searchParams.get('includeHidden') === '1';

    if (includeHidden && !can(principal, 'tl.clinic.catalogue.read')) {
      throw errors.forbidden('tl.clinic.catalogue.read');
    }

    const categorySlug = url.searchParams.get('category') ?? undefined;
    const [categories, units] = await Promise.all([
      listCatalogue({ includeHidden, categorySlug }),
      listPriceUnits(),
    ]);

    return {
      units: units.map((unit) => ({
        key: unit.key,
        name: unit.name,
        shortLabel: unit.shortLabel,
      })),
      categories: categories.map((category) => ({
        slug: category.slug,
        name: category.name,
        patientDescription: category.patientDescription,
        sortOrder: category.sortOrder,
        ...(includeHidden ? { status: category.status } : {}),
        services: category.services.map((service) => ({
          slug: service.slug,
          name: service.name,
          patientDescription: service.patientDescription,
          unit: service.defaultUnit?.key ?? null,
          isCustomQuote: service.isCustomQuote,
          isPackage: service.isPackage,
          ...(includeHidden ? { status: service.status } : {}),
          // Always labelled, never a bare number: a market range rendered
          // without its label reads as a clinic's price (specification §13).
          suggested: describeSuggestedRange({
            minMinor: service.suggestedMinMinor,
            maxMinor: service.suggestedMaxMinor,
            currency: service.suggestedCurrency ?? 'INR',
            openEnded: service.suggestedIsOpenEnded,
            isCustomQuote: service.isCustomQuote,
          }),
          synonyms: service.synonyms.map((synonym) => synonym.keyword),
          variants: service.variants.map((variant) => ({
            slug: variant.slug,
            name: variant.name,
            description: variant.description,
            isCustomQuote: variant.isCustomQuote,
            ...(includeHidden ? { status: variant.status } : {}),
            suggested: describeSuggestedRange({
              minMinor: variant.suggestedMinMinor,
              maxMinor: variant.suggestedMaxMinor,
              currency: variant.suggestedCurrency ?? 'INR',
              openEnded: variant.suggestedIsOpenEnded,
              isCustomQuote: variant.isCustomQuote,
            }),
          })),
        })),
      })),
    };
  },
});
