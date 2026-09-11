/**
 * TOOTHLOGY INDIA DATA — normalization and identity rules (pure)
 *
 * Extracted rows arrive in every spelling and format: "DR. ANIL  KUMAR",
 * "098270 12345", "Baloda Bazar" vs "Balodabazar". These functions turn a row
 * into comparable values, decide what makes two rows "the same person or
 * place", and score how complete a row is. They never touch the database, so
 * the rules are unit-tested at their edges.
 *
 * Nothing here decides that a record is true: normalized data is still
 * UNVERIFIED until a person verifies it.
 */

export type ExtractionEntityKind = 'DENTIST' | 'CLINIC' | 'HOSPITAL' | 'COLLEGE';

const HONORIFICS = /^(dr|dr\.|doctor|prof|prof\.|mr|mr\.|mrs|mrs\.|ms|ms\.)\s+/i;

export function collapse(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\s+/g, ' ').trim() : '';
}

/** Degrees and bodies that stay in capitals whatever case the source used. */
const ACRONYMS = new Set(['BDS', 'MDS', 'MBBS', 'DDS', 'FDS', 'IDA', 'DCI', 'ENT', 'AIIMS', 'GDC', 'PGIMS', 'PGIMER', 'ESIC', 'CGHS', 'NABH', 'LLP', 'PVT', 'LTD']);

/**
 * Re-case a name only when the source shouted it (ALL CAPS) or whispered it
 * (all lower case); a name in mixed case is kept exactly as written, so "E2E
 * Labs" or "iSmile" survive. Known acronyms stay in capitals, and words with
 * digits are left alone.
 */
function titleCase(value: string): string {
  if (value !== value.toUpperCase() && value !== value.toLowerCase()) return value;
  return value
    .split(' ')
    .map((word) => {
      const bare = word.replace(/[^A-Za-z]/g, '').toUpperCase();
      if (ACRONYMS.has(bare)) return word.toUpperCase();
      if (/\d/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/** "DR. ANIL  KUMAR" → "Anil Kumar". The honorific is a title, not part of the name. */
export function normalizePersonName(raw: unknown): string {
  let name = collapse(raw);
  while (HONORIFICS.test(name)) name = name.replace(HONORIFICS, '');
  return titleCase(name.replace(/[.,]+$/, ''));
}

/** "SMILE  DENTAL CLINIC" → "Smile Dental Clinic". */
export function normalizeOrganizationName(raw: unknown): string {
  return titleCase(collapse(raw).replace(/[.,]+$/, ''));
}

/**
 * An Indian mobile number in E.164, or null. Accepts spaces, dashes, a
 * leading 0, 91 or +91. Landlines are not accepted: activation needs a number
 * that can receive an OTP.
 */
export function normalizeIndianMobile(raw: unknown): string | null {
  const text = collapse(raw);
  // A landline is written with its STD code set apart: "0771 2345678",
  // "011-23456789". Its digits can look like a mobile once the 0 is dropped,
  // so the written form decides.
  if (/^0\d{2,4}[\s-]/.test(text)) return null;
  let digits = text.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  const email = collapse(raw).toLowerCase();
  return EMAIL.test(email) ? email : null;
}

/** A six-digit Indian PIN code (never starting with 0), or null. */
export function normalizePincode(raw: unknown): string | null {
  const digits = collapse(raw).replace(/\s/g, '');
  return /^[1-9]\d{5}$/.test(digits) ? digits : null;
}

/** A dental council registration number, uppercased, spacing and separators unified. */
export function normalizeRegistration(raw: unknown): string | null {
  const value = collapse(raw).toUpperCase().replace(/[\s/._-]+/g, '-').replace(/^-+|-+$/g, '');
  return value.length >= 3 ? value : null;
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * The comparison key for a place name: letters and digits only, lower case.
 * "Baloda Bazar", "Baloda-Bazar" and "Balodabazar" are one district.
 */
export function placeKey(value: string): string {
  return collapse(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * What makes two rows the same, strongest evidence first: a council
 * registration (dentists), a mobile number, an email address, or failing
 * those the kind of entity, its name and its district.
 */
export function dedupeKeyFor(entity: ExtractionEntityKind, fields: { registrationNumber?: string | null; phone?: string | null; email?: string | null; name: string; districtId?: string | null }): string {
  if (entity === 'DENTIST' && fields.registrationNumber) return `reg:${fields.registrationNumber}`;
  if (fields.phone) return `phone:${fields.phone}`;
  if (fields.email) return `email:${fields.email}`;
  return `name:${entity}:${fields.districtId ?? 'unknown'}:${placeKey(fields.name)}`;
}

/** 0–100: how much of what is needed to act on the row is present. */
export function confidenceFor(entity: ExtractionEntityKind, fields: { name: string; phone: string | null; email: string | null; districtId: string | null; registrationNumber: string | null; address: string | null; pincode: string | null }): number {
  let score = 0;
  if (fields.name.length >= 3) score += 20;
  if (fields.phone) score += 25;
  if (fields.email) score += 15;
  if (fields.districtId) score += 20;
  if (entity === 'DENTIST') score += fields.registrationNumber ? 20 : 0;
  else score += (fields.address ? 12 : 0) + (fields.pincode ? 8 : 0);
  return Math.min(score, 100);
}

/** Read a column by any of its usual names, case- and punctuation-insensitive. */
export function column(row: Readonly<Record<string, unknown>>, ...names: string[]): string {
  const wanted = new Set(names.map(placeKey));
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(placeKey(key))) {
      const text = collapse(value);
      if (text) return text;
    }
  }
  return '';
}

export interface NormalizedRow {
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly registrationNumber: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly pincode: string | null;
  readonly stateName: string | null;
  readonly districtName: string | null;
  readonly website: string | null;
  /** Values the row carried that could not be normalized, kept for the reviewer. */
  readonly problems: readonly string[];
}

/** Normalize one extracted row, reporting — never silently dropping — what did not parse. */
export function normalizeRow(entity: ExtractionEntityKind, row: Readonly<Record<string, unknown>>): NormalizedRow {
  const problems: string[] = [];
  const rawName = column(row, 'name', 'dentist name', 'doctor name', 'clinic name', 'hospital name', 'college name', 'organization');
  const name = entity === 'DENTIST' ? normalizePersonName(rawName) : normalizeOrganizationName(rawName);
  const rawPhone = column(row, 'phone', 'mobile', 'mobile number', 'contact', 'contact number', 'phone number');
  const phone = normalizeIndianMobile(rawPhone);
  if (rawPhone && !phone) problems.push(`phone “${rawPhone}” is not an Indian mobile number`);
  const rawEmail = column(row, 'email', 'email address', 'e-mail');
  const email = normalizeEmail(rawEmail);
  if (rawEmail && !email) problems.push(`email “${rawEmail}” is not a valid address`);
  const rawPin = column(row, 'pincode', 'pin code', 'pin', 'postal code', 'zip');
  const pincode = normalizePincode(rawPin);
  if (rawPin && !pincode) problems.push(`PIN code “${rawPin}” is not valid`);
  const registrationNumber = normalizeRegistration(column(row, 'registration number', 'registration no', 'reg no', 'registration', 'council registration'));
  const address = collapse(column(row, 'address', 'full address', 'street')) || null;
  return {
    name,
    phone,
    email,
    registrationNumber,
    address,
    city: collapse(column(row, 'city', 'town')) || null,
    pincode,
    stateName: collapse(column(row, 'state', 'state name', 'state/ut', 'ut')) || null,
    districtName: collapse(column(row, 'district', 'district name')) || null,
    website: collapse(column(row, 'website', 'url', 'web')) || null,
    problems,
  };
}
