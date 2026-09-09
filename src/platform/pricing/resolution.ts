/**
 * TOOTHLOGY PRICE RESOLUTION
 *
 * Answers one question: what does this dentist charge for this treatment at
 * this clinic?
 *
 * THE PRIORITY (specification §7)
 *
 *   1. a row for this dentist AND this clinic     the most specific statement
 *   2. a row for this dentist with no clinic      their global price
 *   3. the master catalogue's suggested range     a market reference, labelled
 *
 * The three are not interchangeable and the result says which one was used.
 * A caller that cannot tell the difference will eventually render a market
 * range as a clinic's price, which is the single failure this whole module is
 * shaped to prevent (specification §13, Constitution P9).
 *
 * FALLBACK IS PER TREATMENT, NOT PER PRICE LIST
 * A dentist who overrides two treatments at their Gurgaon clinic has not
 * thereby unset their global price for the other fifty. Resolution runs
 * per service row, so partial overrides behave the way a dentist expects.
 */

export type PriceSource = 'clinic' | 'dentist' | 'catalogue';

/** The shape resolution needs. Deliberately narrower than the Prisma rows. */
export interface ResolvableServicePrice {
  readonly id: string;
  readonly serviceId: string;
  readonly locationId: string | null;
  readonly isEnabled: boolean;
  readonly isPublicVisible: boolean;
}

export interface ResolvedPrice<T extends ResolvableServicePrice> {
  readonly source: PriceSource;
  /** Null when nothing but the catalogue range applies. */
  readonly row: T | null;
}

/**
 * Pick the row that applies at `locationId`, or null to fall through to the
 * catalogue.
 *
 * `locationId` null means "the dentist's general price list", in which case a
 * clinic-specific row must NOT be selected: a Gurgaon-only price is not the
 * answer to "what does this dentist generally charge".
 */
export function resolveServicePrice<T extends ResolvableServicePrice>(
  rows: readonly T[],
  locationId: string | null,
): ResolvedPrice<T> {
  const enabled = rows.filter((row) => row.isEnabled);

  if (locationId !== null) {
    const clinicRow = enabled.find((row) => row.locationId === locationId);
    if (clinicRow) return { source: 'clinic', row: clinicRow };
  }

  const globalRow = enabled.find((row) => row.locationId === null);
  if (globalRow) return { source: 'dentist', row: globalRow };

  return { source: 'catalogue', row: null };
}

/**
 * Resolve a whole price list at once.
 *
 * Grouping by service first means a dentist with a global row and a clinic
 * override for the same treatment yields ONE entry, not two — which is what
 * stops the same crown appearing twice at two prices on a public page.
 */
export function resolvePriceList<T extends ResolvableServicePrice>(
  rows: readonly T[],
  locationId: string | null,
): ReadonlyMap<string, ResolvedPrice<T>> {
  const byService = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = byService.get(row.serviceId);
    if (bucket) bucket.push(row);
    else byService.set(row.serviceId, [row]);
  }

  const resolved = new Map<string, ResolvedPrice<T>>();
  for (const [serviceId, serviceRows] of byService) {
    resolved.set(serviceId, resolveServicePrice(serviceRows, locationId));
  }
  return resolved;
}

/**
 * The scope key stored alongside `locationId`.
 *
 * PostgreSQL treats NULLs as distinct in a UNIQUE constraint, so
 * `UNIQUE (dentist, service, location)` would happily accept unlimited rows
 * whose location is NULL — the global row, which is exactly the one that must
 * be unique. Writing the location id, or the literal below, into a NOT NULL
 * column lets one ordinary unique constraint cover both scopes.
 *
 * The value starts with an underscore so it cannot collide with a real
 * location id, which is always a prefixed ULID.
 */
export const GLOBAL_SCOPE_KEY = '_global';

export function scopeKeyFor(locationId: string | null | undefined): string {
  return locationId ?? GLOBAL_SCOPE_KEY;
}

/** The same trick for a null variant on a price row. See DentistVariantPrice. */
export const BASE_VARIANT_KEY = '_base';

export function variantKeyFor(variantId: string | null | undefined): string {
  return variantId ?? BASE_VARIANT_KEY;
}
