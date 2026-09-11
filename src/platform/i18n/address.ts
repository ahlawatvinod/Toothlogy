/**
 * TOOTHLOGY ADDRESS & PHONE CONVENTIONS
 *
 * Per-country rules for the parts of an address and a phone number that
 * genuinely differ by market: what the postal code is called and looks like,
 * what the first-level region is called, how the lines are ordered, and how a
 * number is grouped for display.
 *
 * WHY RULES AND NOT A LIBRARY
 * A full address/phone library (libaddressinput, libphonenumber) is the right
 * long-term answer and would replace these tables behind the same functions.
 * Until then these are deliberately conservative: a country without a rule
 * gets NO postal validation (accept, never wrongly reject) and a generic
 * grouping. Rejecting a real address because our pattern was wrong is the
 * failure that excludes a market (Constitution P5).
 */

import { COUNTRY_BY_CODE } from '@/registry/globalization';

export interface CountryAddressRules {
  /** Local name for the postal code field. */
  readonly postalCodeLabel: string;
  readonly postalCodePattern: RegExp | null;
  /** Local name for the first-level subdivision. Empty: not used in addresses. */
  readonly regionLabel: string;
  /** Digit grouping for the national significant number, e.g. [5, 5]. */
  readonly phoneGroups: readonly number[];
  /** Trunk prefix dialled nationally and dropped internationally. */
  readonly trunkPrefix: string;
}

const RULES: Readonly<Record<string, CountryAddressRules>> = {
  IN: { postalCodeLabel: 'PIN code', postalCodePattern: /^[1-9]\d{5}$/, regionLabel: 'State', phoneGroups: [5, 5], trunkPrefix: '0' },
  US: { postalCodeLabel: 'ZIP code', postalCodePattern: /^\d{5}(-\d{4})?$/, regionLabel: 'State', phoneGroups: [3, 3, 4], trunkPrefix: '1' },
  CA: { postalCodeLabel: 'Postal code', postalCodePattern: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i, regionLabel: 'Province', phoneGroups: [3, 3, 4], trunkPrefix: '1' },
  GB: { postalCodeLabel: 'Postcode', postalCodePattern: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, regionLabel: '', phoneGroups: [4, 6], trunkPrefix: '0' },
  AE: { postalCodeLabel: '', postalCodePattern: null, regionLabel: 'Emirate', phoneGroups: [2, 3, 4], trunkPrefix: '0' },
  SA: { postalCodeLabel: 'Postal code', postalCodePattern: /^\d{5}(-\d{4})?$/, regionLabel: 'Region', phoneGroups: [2, 3, 4], trunkPrefix: '0' },
  SG: { postalCodeLabel: 'Postal code', postalCodePattern: /^\d{6}$/, regionLabel: '', phoneGroups: [4, 4], trunkPrefix: '' },
  AU: { postalCodeLabel: 'Postcode', postalCodePattern: /^\d{4}$/, regionLabel: 'State', phoneGroups: [1, 4, 4], trunkPrefix: '0' },
  NZ: { postalCodeLabel: 'Postcode', postalCodePattern: /^\d{4}$/, regionLabel: 'Region', phoneGroups: [2, 3, 4], trunkPrefix: '0' },
  DE: { postalCodeLabel: 'Postleitzahl', postalCodePattern: /^\d{5}$/, regionLabel: 'Bundesland', phoneGroups: [3, 4, 4], trunkPrefix: '0' },
  FR: { postalCodeLabel: 'Code postal', postalCodePattern: /^\d{5}$/, regionLabel: 'Région', phoneGroups: [1, 2, 2, 2, 2], trunkPrefix: '0' },
  NP: { postalCodeLabel: 'Postal code', postalCodePattern: /^\d{5}$/, regionLabel: 'Province', phoneGroups: [3, 3, 4], trunkPrefix: '0' },
  BD: { postalCodeLabel: 'Postal code', postalCodePattern: /^\d{4}$/, regionLabel: 'Division', phoneGroups: [4, 6], trunkPrefix: '0' },
  LK: { postalCodeLabel: 'Postal code', postalCodePattern: /^\d{5}$/, regionLabel: 'Province', phoneGroups: [2, 3, 4], trunkPrefix: '0' },
};

const GENERIC: CountryAddressRules = {
  postalCodeLabel: 'Postal code',
  postalCodePattern: null,
  regionLabel: 'Region',
  phoneGroups: [3, 3, 4],
  trunkPrefix: '0',
};

export function addressRules(countryCode: string): CountryAddressRules {
  return RULES[countryCode.toUpperCase()] ?? GENERIC;
}

/**
 * Whether a postal code is plausible for the country. Countries without a
 * known pattern accept anything non-empty rather than risk a false rejection.
 */
export function isValidPostalCode(countryCode: string, code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  const pattern = addressRules(countryCode).postalCodePattern;
  return pattern ? pattern.test(trimmed) : true;
}

export interface AddressParts {
  readonly lines: readonly string[];
  readonly locality?: string | null;
  readonly regionName?: string | null;
  readonly postalCode?: string | null;
  readonly countryCode: string;
}

/**
 * Address lines in local order, for display and for a postal label.
 *
 * Toothlogy's markets write street-first; a largest-unit-first country (Japan,
 * China) would reverse this, and gets its own rule when it is enabled.
 */
export function formatAddress(address: AddressParts, options: { includeCountry?: boolean } = {}): string[] {
  const country = COUNTRY_BY_CODE.get(address.countryCode.toUpperCase());
  const code = address.countryCode.toUpperCase();
  const lines = address.lines.filter((l) => l.trim().length > 0).map((l) => l.trim());

  const locality = address.locality?.trim();
  const region = address.regionName?.trim();
  const postal = address.postalCode?.trim();

  switch (code) {
    case 'US':
    case 'CA':
    case 'AU':
      // "Springfield, IL 62701"
      lines.push([locality, [region, postal].filter(Boolean).join(' ')].filter(Boolean).join(', '));
      break;
    case 'GB':
      if (locality) lines.push(locality.toUpperCase());
      if (postal) lines.push(postal.toUpperCase());
      break;
    case 'IN':
      // "Raipur, Chhattisgarh 492001"
      lines.push([locality, [region, postal].filter(Boolean).join(' ')].filter(Boolean).join(', '));
      break;
    default:
      lines.push([postal, locality].filter(Boolean).join(' '));
      if (region) lines.push(region);
  }

  if (options.includeCountry && country) lines.push(country.name);
  return lines.filter((l) => l.length > 0);
}

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------

/**
 * Normalise what a user typed to E.164, using the country to supply the
 * calling code and drop the national trunk prefix. Returns null when the
 * input cannot be a phone number. It does NOT prove the number is assigned —
 * only an SMS code proves that.
 */
export function normalizePhone(input: string, defaultCountryCode: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 6 || digits.length > 15) return null;

  if (trimmed.startsWith('+')) return `+${digits}`;
  if (trimmed.startsWith('00')) return `+${digits.slice(2)}`;

  const country = COUNTRY_BY_CODE.get(defaultCountryCode.toUpperCase());
  if (!country) return null;
  const callingCode = country.callingCode.replace('+', '');
  const trunk = addressRules(defaultCountryCode).trunkPrefix;

  // Already includes the calling code without the plus: "919876543210".
  if (digits.startsWith(callingCode) && digits.length > 10) return `+${digits}`;

  const national = trunk && digits.startsWith(trunk) ? digits.slice(trunk.length) : digits;
  const result = `+${callingCode}${national}`;
  return /^\+[1-9]\d{6,14}$/.test(result) ? result : null;
}

/** "+919876543210" → "+91 98765 43210". Unknown shapes fall back to groups of three. */
export function formatPhone(e164: string): string {
  if (!/^\+\d{7,15}$/.test(e164)) return e164;
  const digits = e164.slice(1);

  // Longest calling code that matches an enabled or known country.
  const match = [...COUNTRY_BY_CODE.values()]
    .map((c) => ({ code: c.code, calling: c.callingCode.replace('+', '') }))
    .filter((c) => digits.startsWith(c.calling))
    .sort((a, b) => b.calling.length - a.calling.length)[0];

  if (!match) return `+${digits.replace(/(\d{3})(?=\d)/g, '$1 ')}`;

  const national = digits.slice(match.calling.length);
  const groups = addressRules(match.code).phoneGroups;
  const parts: string[] = [];
  let cursor = 0;
  for (const size of groups) {
    if (cursor >= national.length) break;
    parts.push(national.slice(cursor, cursor + size));
    cursor += size;
  }
  if (cursor < national.length) parts.push(national.slice(cursor));
  return `+${match.calling} ${parts.join(' ')}`;
}
