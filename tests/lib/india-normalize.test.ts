/**
 * TL-TEST-INDIA-NORMALIZE-001 — normalization, identity and confidence rules for extracted data.
 */

import { describe, expect, it } from 'vitest';
import {
  confidenceFor,
  dedupeKeyFor,
  normalizeEmail,
  normalizeIndianMobile,
  normalizeOrganizationName,
  normalizePersonName,
  normalizePincode,
  normalizeRegistration,
  normalizeRow,
  placeKey,
  slugify,
} from '@/platform/india-data/normalize';

describe('names', () => {
  it('drops honorifics and fixes all-caps or all-lower case, keeping mixed case', () => {
    expect(normalizePersonName('DR. ANIL  KUMAR')).toBe('Anil Kumar');
    expect(normalizePersonName('dr priya sharma.')).toBe('Priya Sharma');
    expect(normalizePersonName('Prof. Dr. K. McKenzie')).toBe('K. McKenzie');
    expect(normalizeOrganizationName('SMILE   DENTAL CLINIC')).toBe('Smile Dental Clinic');
  });

  it('keeps acronyms, words with digits and mixed-case names as written', () => {
    expect(normalizeOrganizationName('E2E Smile Dental mtvw4tz4')).toBe('E2E Smile Dental mtvw4tz4');
    expect(normalizeOrganizationName('iSmile Dental')).toBe('iSmile Dental');
    expect(normalizeOrganizationName('GOVT. DENTAL COLLEGE (GDC) RAIPUR')).toBe('Govt. Dental College (GDC) Raipur');
    expect(normalizePersonName('DR. ANIL KUMAR, BDS, MDS')).toBe('Anil Kumar, BDS, MDS');
    expect(normalizeOrganizationName('aiims raipur dental block 2')).toBe('AIIMS Raipur Dental Block 2');
  });
});

describe('contact details', () => {
  it('turns every Indian mobile format into E.164 and refuses landlines and junk', () => {
    for (const raw of ['9827012345', '098270 12345', '+91 98270-12345', '91 9827012345', 9827012345]) {
      expect(normalizeIndianMobile(raw)).toBe('+919827012345');
    }
    expect(normalizeIndianMobile('0771 2345678')).toBeNull(); // landline
    expect(normalizeIndianMobile('12345')).toBeNull();
    expect(normalizeIndianMobile('5827012345')).toBeNull(); // mobiles start 6–9
  });

  it('lower-cases valid emails and refuses invalid ones', () => {
    expect(normalizeEmail('  Dr.Anil@Example.COM ')).toBe('dr.anil@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
  });

  it('accepts six-digit PIN codes only', () => {
    expect(normalizePincode('492 001')).toBe('492001'); // PINs are often written spaced
    expect(normalizePincode('492001')).toBe('492001');
    expect(normalizePincode('49200')).toBeNull();
    expect(normalizePincode('092001')).toBeNull();
  });

  it('unifies registration numbers', () => {
    expect(normalizeRegistration('cgdc / a 1203')).toBe('CGDC-A-1203');
    expect(normalizeRegistration('x')).toBeNull();
  });
});

describe('identity', () => {
  it('treats spellings of one district as one key', () => {
    expect(placeKey('Baloda Bazar')).toBe(placeKey('Baloda-Bazar'));
    expect(placeKey('Baloda Bazar')).toBe(placeKey('Balodabazar'));
    expect(slugify('Gaurela-Pendra-Marwahi')).toBe('gaurela-pendra-marwahi');
  });

  it('prefers registration, then phone, then email, then entity + name + district', () => {
    expect(dedupeKeyFor('DENTIST', { registrationNumber: 'CGDC-A-1', phone: '+919827012345', name: 'A' })).toBe('reg:CGDC-A-1');
    expect(dedupeKeyFor('CLINIC', { registrationNumber: 'X-1', phone: '+919827012345', name: 'A' })).toBe('phone:+919827012345');
    expect(dedupeKeyFor('CLINIC', { email: 'a@b.in', name: 'A' })).toBe('email:a@b.in');
    expect(dedupeKeyFor('CLINIC', { name: 'Smile Dental', districtId: 'dst_1' })).toBe('name:CLINIC:dst_1:smiledental');
    expect(dedupeKeyFor('HOSPITAL', { name: 'Smile Dental', districtId: 'dst_1' })).not.toBe(dedupeKeyFor('CLINIC', { name: 'Smile Dental', districtId: 'dst_1' }));
  });

  it('scores completeness from 0 to 100', () => {
    const full = { name: 'Anil Kumar', phone: '+919827012345', email: 'a@b.in', districtId: 'd', registrationNumber: 'R-1', address: null, pincode: null };
    expect(confidenceFor('DENTIST', full)).toBe(100);
    expect(confidenceFor('DENTIST', { ...full, phone: null, email: null, registrationNumber: null })).toBe(40);
    expect(confidenceFor('CLINIC', { ...full, registrationNumber: null, address: 'Main Road', pincode: '492001' })).toBe(100);
  });
});

describe('rows', () => {
  it('reads columns by their usual names and reports what did not parse', () => {
    const row = normalizeRow('DENTIST', { 'Doctor Name': 'DR. ANIL KUMAR', Mobile: '0771 2345678', 'E-mail': 'anil@clinic.in', 'Reg No': 'cgdc a 55', District: 'Raipur', State: 'Chhattisgarh', 'PIN Code': '49200' });
    expect(row).toMatchObject({ name: 'Anil Kumar', phone: null, email: 'anil@clinic.in', registrationNumber: 'CGDC-A-55', districtName: 'Raipur', stateName: 'Chhattisgarh', pincode: null });
    expect(row.problems).toHaveLength(2); // the landline and the short PIN are reported, not dropped silently
  });
});
