/**
 * TOOTHLOGY PRICE UNITS — canonical reference list
 *
 * What a price is *per*. "₹12,000" for a crown and "₹12,000" for a full-mouth
 * rehabilitation are different offers, and the unit is the whole difference.
 *
 * WHY THIS IS DATA AND NOT AN ENUM
 * Dentistry prices things in units that vary by market and by practice. An
 * enum would mean that adding "per implant fixture" for one clinic requires a
 * schema migration, a deploy and a release window — for what is really a piece
 * of reference data. The seed loads these rows; an administrator can add more.
 *
 * `shortLabel` is what gets appended to a rendered price, so it carries its own
 * leading slash: "₹12,000" + "/tooth". It is deliberately empty for `package`
 * and `custom_quote`, where a suffix reads as nonsense ("Custom quote/quote").
 */

export interface PriceUnitSeed {
  readonly key: string;
  readonly name: string;
  readonly shortLabel: string;
}

export const PRICE_UNITS: readonly PriceUnitSeed[] = [
  { key: 'per_visit', name: 'Per visit', shortLabel: '/visit' },
  { key: 'per_session', name: 'Per session', shortLabel: '/session' },
  { key: 'per_tooth', name: 'Per tooth', shortLabel: '/tooth' },
  { key: 'per_quadrant', name: 'Per quadrant', shortLabel: '/quadrant' },
  { key: 'per_jaw', name: 'Per jaw', shortLabel: '/jaw' },
  { key: 'per_arch', name: 'Per arch', shortLabel: '/arch' },
  { key: 'per_implant', name: 'Per implant', shortLabel: '/implant' },
  { key: 'per_crown', name: 'Per crown', shortLabel: '/crown' },
  { key: 'per_unit', name: 'Per unit', shortLabel: '/unit' },
  { key: 'per_case', name: 'Per case', shortLabel: '/case' },
  { key: 'per_appliance', name: 'Per appliance', shortLabel: '/appliance' },
  { key: 'per_procedure', name: 'Per procedure', shortLabel: '/procedure' },
  { key: 'package', name: 'Package', shortLabel: '' },
  { key: 'custom_quote', name: 'Custom quote', shortLabel: '' },
] as const;

export const PRICE_UNIT_KEYS: readonly string[] = PRICE_UNITS.map((unit) => unit.key);

export const PRICE_UNIT_BY_KEY: ReadonlyMap<string, PriceUnitSeed> = new Map(
  PRICE_UNITS.map((unit) => [unit.key, unit]),
);

export function isKnownPriceUnit(key: string): boolean {
  return PRICE_UNIT_BY_KEY.has(key);
}
