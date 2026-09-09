/**
 * Master catalogue integrity (specification §1, §24, §25, §29).
 *
 * These tests guard the seed data itself. A price range transcribed wrongly, a
 * duplicated slug or a service pointing at a pricing unit that does not exist
 * are all silent at compile time and only surface as a wrong number on a
 * patient-facing page, so they are asserted here instead.
 */

import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  CATALOGUE_SERVICE_COUNT,
  CATALOGUE_VARIANT_COUNT,
  rupeesToMinor,
} from '@/platform/catalogue/catalogue-data';
import { PRICE_UNIT_BY_KEY, PRICE_UNITS } from '@/platform/catalogue/units';

const allServices = CATALOGUE.flatMap((category) =>
  category.services.map((service) => ({ category, service })),
);

const allVariants = allServices.flatMap(({ service }) =>
  (service.variants ?? []).map((variant) => ({ service, variant })),
);

describe('shape', () => {
  it('has the 17 categories the specification lists', () => {
    expect(CATALOGUE).toHaveLength(17);
  });

  it('has services in every category', () => {
    for (const category of CATALOGUE) {
      expect(category.services.length, `${category.name} has no services`).toBeGreaterThan(0);
    }
  });

  it('counts services and variants consistently with the exported totals', () => {
    expect(CATALOGUE_SERVICE_COUNT).toBe(allServices.length);
    expect(CATALOGUE_VARIANT_COUNT).toBe(allVariants.length);
  });
});

describe('identifiers', () => {
  it('has unique category slugs', () => {
    const slugs = CATALOGUE.map((category) => category.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has unique service slugs across the whole catalogue', () => {
    // Global uniqueness, not per category: the slug is the public identifier
    // and one canonical service may appear under several categories.
    const slugs = allServices.map(({ service }) => service.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has unique variant slugs within each service', () => {
    for (const { service } of allServices) {
      const slugs = (service.variants ?? []).map((variant) => variant.slug);
      expect(new Set(slugs).size, `${service.name} has duplicate variant slugs`).toBe(slugs.length);
    }
  });

  it('uses lower-case hyphenated slugs throughout', () => {
    const pattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    for (const category of CATALOGUE) expect(category.slug).toMatch(pattern);
    for (const { service } of allServices) expect(service.slug).toMatch(pattern);
    for (const { variant } of allVariants) expect(variant.slug).toMatch(pattern);
  });
});

describe('units', () => {
  it('has unique unit keys', () => {
    const keys = PRICE_UNITS.map((unit) => unit.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('references only units that exist', () => {
    for (const { service } of allServices) {
      expect(PRICE_UNIT_BY_KEY.has(service.unit), `${service.name} → '${service.unit}'`).toBe(true);
    }
  });

  it('prices custom-quote services with the custom quote unit', () => {
    for (const { service } of allServices) {
      if (service.customQuote) expect(service.unit).toBe('custom_quote');
    }
  });
});

describe('price ranges', () => {
  it('never has a maximum below its minimum', () => {
    for (const { service } of allServices) {
      if (service.min !== undefined && service.max !== undefined) {
        expect(service.max, `${service.name}`).toBeGreaterThanOrEqual(service.min);
      }
    }
    for (const { service, variant } of allVariants) {
      if (variant.min !== undefined && variant.max !== undefined) {
        expect(variant.max, `${service.name} → ${variant.name}`).toBeGreaterThanOrEqual(
          variant.min,
        );
      }
    }
  });

  it('never has a negative or zero-floor price', () => {
    for (const { service } of allServices) {
      if (service.min !== undefined) expect(service.min).toBeGreaterThan(0);
    }
  });

  it('gives every priced service a range, and every custom-quote service none', () => {
    for (const { service } of allServices) {
      if (service.customQuote) {
        expect(service.min, `${service.name} is custom quote but has a minimum`).toBeUndefined();
      } else {
        expect(service.min, `${service.name} has no minimum`).toBeDefined();
      }
    }
  });

  it('keeps every variant range inside its parent service range', () => {
    // Otherwise the service says "₹2,500–₹20,000" while a variant under it
    // quietly costs ₹30,000, and the summary line on a category page lies.
    for (const { service, variant } of allVariants) {
      if (variant.min !== undefined && service.min !== undefined) {
        expect(variant.min, `${service.name} → ${variant.name} min`).toBeGreaterThanOrEqual(
          service.min,
        );
      }
      if (variant.max !== undefined && service.max !== undefined) {
        expect(variant.max, `${service.name} → ${variant.name} max`).toBeLessThanOrEqual(
          service.max,
        );
      }
    }
  });
});

describe('the ranges the specification supplied, spot-checked verbatim', () => {
  const find = (slug: string) => allServices.find((entry) => entry.service.slug === slug)?.service;
  const variant = (serviceSlug: string, variantSlug: string) =>
    find(serviceSlug)?.variants?.find((v) => v.slug === variantSlug);

  it.each([
    ['dental-consultation', 300, 1500],
    ['iopa-xray', 200, 500],
    ['cbct', 1500, 5000],
    ['oral-prophylaxis-scaling', 800, 2500],
    ['inlay-onlay', 4000, 15000],
    ['simple-extraction', 800, 2500],
    ['teeth-whitening', 5000, 15000],
    ['pulpotomy', 2000, 5000],
    ['root-planing', 1000, 3000],
    ['biopsy', 3000, 10000],
    ['emergency-dressing', 500, 1500],
    ['nitrous-sedation', 2000, 5000],
    ['night-guard', 3000, 10000],
    ['retainers', 2000, 10000],
  ])('%s is ₹%i–₹%i', (slug, min, max) => {
    expect(find(slug)?.min).toBe(min);
    expect(find(slug)?.max).toBe(max);
  });

  it.each([
    ['root-canal-treatment', 'anterior', 3000, 7000],
    ['root-canal-treatment', 'premolar', 4000, 9000],
    ['root-canal-treatment', 'molar', 5000, 12000],
    ['root-canal-treatment', 're-rct', 7000, 18000],
    ['crown', 'pfm', 4000, 8000],
    ['crown', 'zirconia', 8000, 18000],
    ['crown', 'e-max', 10000, 20000],
    ['crown', 'metal', 2500, 6000],
    ['denture', 'complete', 8000, 30000],
    ['denture', 'partial', 5000, 25000],
    ['denture', 'flexible', 8000, 20000],
    ['braces', 'metal', 25000, 50000],
    ['braces', 'ceramic', 35000, 70000],
    ['braces', 'self-ligating', 40000, 80000],
    ['dental-implant', 'placement-only', 20000, 50000],
  ])('%s → %s is ₹%i–₹%i', (serviceSlug, variantSlug, min, max) => {
    expect(variant(serviceSlug, variantSlug)?.min).toBe(min);
    expect(variant(serviceSlug, variantSlug)?.max).toBe(max);
  });
});

describe('duplicate handling (§25)', () => {
  it('lists Emergency Consultation once, under two categories', () => {
    const matches = allServices.filter(({ service }) =>
      service.name.toLowerCase().includes('emergency consultation'),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.service.alsoIn).toContain('emergency-dentistry');
  });

  it('lists fluoride once, reachable from Paediatric too', () => {
    const matches = allServices.filter(({ service }) =>
      service.name.toLowerCase().startsWith('fluoride'),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.service.alsoIn).toContain('pediatric-dentistry');
  });

  it('points every alsoIn at a category that exists', () => {
    const slugs = new Set(CATALOGUE.map((category) => category.slug));
    for (const { service } of allServices) {
      for (const slug of service.alsoIn ?? []) {
        expect(slugs.has(slug), `${service.name} → '${slug}'`).toBe(true);
      }
    }
  });

  it('never lists a service as also belonging to its own primary category', () => {
    for (const { category, service } of allServices) {
      expect(service.alsoIn ?? []).not.toContain(category.slug);
    }
  });
});

describe('descriptions (§1, §2, §24)', () => {
  it('gives every service a full and a short description', () => {
    for (const { service } of allServices) {
      expect(service.description, `${service.name} has no description`).toBeTruthy();
      expect(service.shortDescription, `${service.name} has no short description`).toBeTruthy();
    }
  });

  it('gives every variant a description', () => {
    for (const { service, variant } of allVariants) {
      expect(variant.description, `${service.name} → ${variant.name}`).toBeTruthy();
    }
  });

  it('keeps short descriptions short enough for a table cell', () => {
    for (const { service } of allServices) {
      expect(service.shortDescription!.length, service.name).toBeLessThanOrEqual(120);
    }
  });

  it('writes descriptions that are substantially longer than the short form', () => {
    // Otherwise the short description is doing no work and the two fields have
    // collapsed into one duplicated sentence.
    for (const { service } of allServices) {
      expect(service.description!.length, service.name).toBeGreaterThan(
        service.shortDescription!.length,
      );
    }
  });

  it('makes no outcome guarantees, which a health platform must not', () => {
    // Constitution P1: clinical safety outranks growth. A catalogue that
    // promises "painless" or "permanent" is making a claim no clinic can keep.
    //
    // "permanent" is deliberately NOT in this list. It is ordinary clinical
    // vocabulary — permanent molars, a permanent restoration, "not a permanent
    // repair" — and forbidding the word would force the descriptions into
    // vaguer language than the anatomy allows. What is forbidden is a promise
    // about the RESULT, which is a different thing.
    const forbidden =
      /\b(guarantee[ds]?|guaranteed|painless|pain[- ]free|100%|risk[- ]free|best in|cure[sd]?|lifelong|permanently\s+(?:white|straight|fixed))\b/i;
    for (const { service } of allServices) {
      expect(forbidden.test(service.description!), `${service.name}: ${service.description}`).toBe(
        false,
      );
      expect(forbidden.test(service.shortDescription!), service.name).toBe(false);
    }
    for (const { service, variant } of allVariants) {
      expect(
        forbidden.test(variant.description!),
        `${service.name} → ${variant.name}: ${variant.description}`,
      ).toBe(false);
    }
  });

  it('does not repeat the parent service description on its variants', () => {
    for (const { service, variant } of allVariants) {
      expect(variant.description).not.toBe(service.description);
      expect(variant.description).not.toBe(service.shortDescription);
    }
  });

  it('writes distinct descriptions for sibling variants', () => {
    // Two crowns described identically tell a patient nothing about which to
    // choose, which is the entire point of listing them separately.
    for (const { service } of allServices) {
      const descriptions = (service.variants ?? []).map((variant) => variant.description);
      expect(new Set(descriptions).size, service.name).toBe(descriptions.length);
    }
  });
});

describe('rupeesToMinor', () => {
  it('converts rupees to paise', () => {
    expect(rupeesToMinor(12000)).toBe(1_200_000n);
  });

  it('refuses a fractional rupee, which in this file means a typo', () => {
    expect(() => rupeesToMinor(1200.5)).toThrow(/whole rupees/);
  });
});
