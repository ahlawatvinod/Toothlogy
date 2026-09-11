/**
 * TL-TEST-CONTACT-DETAILS-001 — the one rule for phone numbers and emails in public text.
 */

import { describe, expect, it } from 'vitest';
import { containsContactDetails } from '@/lib/contact-details';

describe('containsContactDetails', () => {
  it('finds Indian mobiles in any usual format and email addresses', () => {
    for (const text of ['Call 9827012345', 'call 98270 12345 today', 'ring +91 98270-12345', '+919827012345', 'mail me: a.b+c@example.co.in']) {
      expect(containsContactDetails(text)).toBe(true);
    }
  });

  it('leaves ordinary dental text alone', () => {
    for (const text of ['Teeth 36 and 46 need fillings', 'Brush twice a day for 2 minutes', 'Cost was around 4500 rupees', 'Follow up in 2026-09', 'Reference DE-4(12)/2003']) {
      expect(containsContactDetails(text)).toBe(false);
    }
  });
});
