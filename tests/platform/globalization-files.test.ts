/**
 * TL-TEST-GLOBAL-FILES-001 — Address/phone conventions, content sniffing, search filters
 *
 * Pure functions with outsized consequences: a postal pattern that rejects a
 * real code excludes a market; a sniffer that trusts a declared type is a
 * stored-XSS vector; a search filter that accepts any field is a probe.
 */

import { describe, expect, it } from 'vitest';
import { addressRules, formatAddress, formatPhone, isValidPostalCode, normalizePhone } from '@/platform/i18n/address';
import { PURPOSE_POLICY, sniffContentType } from '@/platform/storage/files';
import { isValidStorageKey } from '@/platform/storage/local-adapter';
import { parseSearchFilters } from '@/platform/search/service';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (s: string) => new TextEncoder().encode(s);

describe('postal codes', () => {
  it('validates the formats of known countries', () => {
    expect(isValidPostalCode('IN', '492001')).toBe(true);
    expect(isValidPostalCode('IN', '092001')).toBe(false); // PIN codes never start with 0
    expect(isValidPostalCode('US', '94103')).toBe(true);
    expect(isValidPostalCode('US', '94103-1234')).toBe(true);
    expect(isValidPostalCode('GB', 'SW1A 1AA')).toBe(true);
    expect(isValidPostalCode('CA', 'K1A 0B1')).toBe(true);
  });

  it('never rejects a code for a country whose format it does not know', () => {
    expect(isValidPostalCode('ZZ', 'ANY-thing 9')).toBe(true);
    expect(isValidPostalCode('AE', 'PO Box 1234')).toBe(true); // UAE has no postcodes
  });

  it('names the fields the way each country does', () => {
    expect(addressRules('IN')).toMatchObject({ postalCodeLabel: 'PIN code', regionLabel: 'State' });
    expect(addressRules('US').postalCodeLabel).toBe('ZIP code');
    expect(addressRules('AE').postalCodePattern).toBeNull();
  });
});

describe('address formatting', () => {
  it('writes an Indian address in local order', () => {
    expect(
      formatAddress({
        lines: ['12 MG Road', 'Near City Hospital'],
        locality: 'Raipur',
        regionName: 'Chhattisgarh',
        postalCode: '492001',
        countryCode: 'IN',
      }),
    ).toEqual(['12 MG Road', 'Near City Hospital', 'Raipur, Chhattisgarh 492001']);
  });

  it('writes a US address with state and ZIP on the city line', () => {
    expect(
      formatAddress({ lines: ['1 Main St'], locality: 'Springfield', regionName: 'IL', postalCode: '62701', countryCode: 'US' }),
    ).toEqual(['1 Main St', 'Springfield, IL 62701']);
  });
});

describe('phone numbers', () => {
  it('normalises national input to E.164', () => {
    expect(normalizePhone('098765 43210', 'IN')).toBe('+919876543210');
    expect(normalizePhone('98765-43210', 'IN')).toBe('+919876543210');
    expect(normalizePhone('+44 20 7946 0958', 'IN')).toBe('+442079460958');
    expect(normalizePhone('0044 20 7946 0958', 'IN')).toBe('+442079460958');
  });

  it('refuses things that cannot be a phone number', () => {
    expect(normalizePhone('12', 'IN')).toBeNull();
    expect(normalizePhone('not a number', 'IN')).toBeNull();
  });

  it('groups numbers for display by country', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('not-e164')).toBe('not-e164');
  });
});

describe('content sniffing', () => {
  it('recognises accepted formats by their bytes', () => {
    expect(sniffContentType(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg')).toBe('image/jpeg');
    expect(sniffContentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png')).toBe('image/png');
    expect(sniffContentType(text('%PDF-1.7\n'), 'application/pdf')).toBe('application/pdf');
    expect(sniffContentType(text('RIFF\0\0\0\0WEBPVP8 '), 'image/webp')).toBe('image/webp');
  });

  it('recognises DICOM by its preamble marker', () => {
    const dicom = new Uint8Array(200);
    dicom.set(text('DICM'), 128);
    expect(sniffContentType(dicom, 'application/dicom')).toBe('application/dicom');
  });

  it('never recognises HTML or SVG, whatever they claim to be', () => {
    expect(sniffContentType(text('<!doctype html><script>alert(1)</script>'), 'image/jpeg')).toBeNull();
    expect(sniffContentType(text('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>'), 'image/svg+xml')).toBeNull();
  });

  it('does not accept SVG for any purpose', () => {
    for (const policy of Object.values(PURPOSE_POLICY)) {
      expect(policy.types).not.toContain('image/svg+xml');
      expect(policy.types).not.toContain('text/html');
    }
  });

  it('classifies clinical purposes as PHI and public imagery as public', () => {
    expect(PURPOSE_POLICY.XRAY.sensitivity).toBe('phi');
    expect(PURPOSE_POLICY.PRESCRIPTION.sensitivity).toBe('phi');
    expect(PURPOSE_POLICY.CLINIC_PHOTO.sensitivity).toBe('public');
    expect(PURPOSE_POLICY.IDENTITY_DOCUMENT.sensitivity).toBe('confidential');
  });
});

describe('storage keys', () => {
  it('accepts the keys the file service generates and nothing that escapes the root', () => {
    expect(isValidStorageKey('xray/2026/09/fil_01jf3qk8zr7x2v9nbq4c6t5mhd')).toBe(true);
    expect(isValidStorageKey('../etc/passwd')).toBe(false);
    expect(isValidStorageKey('a/../../b')).toBe(false);
    expect(isValidStorageKey('/absolute')).toBe(false);
    expect(isValidStorageKey('UPPER/case')).toBe(false);
  });
});

describe('search filter parsing', () => {
  it('parses equality, lists and numeric bounds for allowed fields', () => {
    const params = new URLSearchParams(
      'filter[language]=hi&filter[specialty]=endodontics,orthodontics&filter[fee.lte]=50000',
    );
    expect(parseSearchFilters('dentist', params)).toEqual([
      { field: 'language', operator: 'eq', value: 'hi' },
      { field: 'specialty', operator: 'in', value: ['endodontics', 'orthodontics'] },
      { field: 'fee', operator: 'lte', value: 50000 },
    ]);
  });

  it('refuses a field the type does not allow rather than ignoring it', () => {
    expect(() => parseSearchFilters('dentist', new URLSearchParams('filter[email]=x'))).toThrow(/Cannot filter/);
  });

  it('refuses a non-numeric bound', () => {
    expect(() => parseSearchFilters('dentist', new URLSearchParams('filter[fee.gte]=abc'))).toThrow(/number/);
  });
});
