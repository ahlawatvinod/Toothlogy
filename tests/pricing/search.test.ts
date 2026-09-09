/**
 * Treatment search and synonyms (specification §11).
 *
 * The worked examples in the specification are used verbatim as test cases:
 * "RCT" must find Root Canal Treatment, "cap" must find Crown, and so on.
 */

import { describe, expect, it } from 'vitest';
import { normalize, normalizeTight, searchServices } from '@/platform/pricing/search';
import { CATALOGUE } from '@/platform/catalogue/catalogue-data';

/** The real seeded catalogue, so these tests fail if a synonym is dropped. */
const SERVICES = CATALOGUE.flatMap((category) =>
  category.services.map((service) => ({
    id: service.slug,
    name: service.name,
    categoryName: category.name,
    synonyms: service.synonyms ?? [],
    variantNames: (service.variants ?? []).map((variant) => variant.name),
  })),
);

const namesFor = (query: string) =>
  searchServices(SERVICES, query).map((match) => match.service.name);

describe('normalize', () => {
  it('collapses case, punctuation and spacing', () => {
    expect(normalize('X-Ray')).toBe('xray');
    expect(normalize('  Root   Canal  ')).toBe('root canal');
    expect(normalize('E-Max')).toBe('emax');
  });

  it('removes spaces entirely in the tight form', () => {
    expect(normalizeTight('root canal')).toBe('rootcanal');
  });
});

describe('the specification’s worked examples', () => {
  it('"RCT" finds Root Canal Treatment', () => {
    expect(namesFor('RCT')[0]).toBe('Root Canal Treatment');
  });

  it('"root canal" finds Root Canal Treatment and its variants are attached', () => {
    const [top] = searchServices(SERVICES, 'root canal');
    expect(top?.service.name).toBe('Root Canal Treatment');
    expect(top?.service.variantNames).toEqual(
      expect.arrayContaining(['Anterior', 'Premolar', 'Molar', 'Re-RCT']),
    );
  });

  it('"cap" finds Crown', () => {
    expect(namesFor('cap')).toContain('Crown');
  });

  it('"braces" finds Braces, whose variants are metal, ceramic and self-ligating', () => {
    const [top] = searchServices(SERVICES, 'braces');
    expect(top?.service.name).toBe('Braces');
    expect(top?.service.variantNames).toEqual(
      expect.arrayContaining(['Metal', 'Ceramic', 'Self-Ligating']),
    );
  });

  it('"teeth cleaning" finds both scaling and deep cleaning', () => {
    const names = namesFor('teeth cleaning');
    expect(names).toContain('Oral Prophylaxis / Scaling');
    expect(names).toContain('Deep Cleaning');
  });
});

describe('ranking', () => {
  it('puts an exact name match above a service that merely contains the word', () => {
    expect(namesFor('crown')[0]).toBe('Crown');
  });

  it('matches a word inside a name but not an arbitrary substring', () => {
    expect(namesFor('canal')).toContain('Root Canal Treatment');
    // "own" appears inside "Crown" but is not a word anyone searches for.
    expect(namesFor('own')).not.toContain('Crown');
  });

  it('is stable: the same query twice gives the same order', () => {
    expect(namesFor('implant')).toEqual(namesFor('implant'));
  });

  it('returns the whole list for an empty query rather than nothing', () => {
    expect(searchServices(SERVICES, '   ')).toHaveLength(SERVICES.length);
  });

  it('returns nothing for a term the catalogue genuinely does not cover', () => {
    expect(searchServices(SERVICES, 'cardiology')).toHaveLength(0);
  });
});

describe('patient vocabulary', () => {
  it.each([
    ['xray', 'IOPA X-Ray'],
    ['x-ray', 'IOPA X-Ray'],
    ['wisdom tooth', 'Wisdom Tooth Extraction'],
    ['false teeth', 'Denture'],
    ['invisible braces', 'Clear Aligners'],
    ['whitening', 'Teeth Whitening'],
    ['toothache', 'Emergency Consultation'],
    ['night guard', 'Night Guard'],
    ['sensitive teeth', 'Desensitization'],
  ])('"%s" finds %s', (query, expected) => {
    expect(namesFor(query)).toContain(expected);
  });
});
