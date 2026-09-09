/**
 * Approved image asset registry (specification §28, §29).
 *
 * These guard the mapping between the brief's approved asset list, the
 * catalogue this site already has, and the files on disk. A slug that drifts
 * out of alignment silently unhooks an image, which is invisible until someone
 * notices a blank card.
 */

import { describe, expect, it } from 'vitest';
import {
  ASSET_BY_SERVICE_SLUG,
  ASSET_BY_SLUG,
  ASSET_BY_SPECIALTY_KEY,
  ASSET_DIMENSIONS,
  BANNER_ASSETS,
  IMAGE_ASSETS,
  SERVICE_ASSETS,
  auditAssets,
  hasAsset,
  resolveAsset,
  resolveServiceAsset,
  resolveSpecialtyAsset,
} from '@/platform/media';
import { CATALOGUE } from '@/platform/catalogue/catalogue-data';
import { DENTAL_SPECIALTIES } from '@/platform/dentists/specialties';

/** The exact slug list from §28 of the brief, transcribed. */
const BRIEF_SLUGS = [
  'dental-consultation', 'emergency-dental-consultation', 'dental-examination', 'iopa-xray',
  'opg', 'cbct', 'digital-smile-design', 'oral-prophylaxis-scaling', 'fluoride-application',
  'pit-fissure-sealant', 'dental-desensitization', 'tooth-coloured-filling', 'gic-filling',
  'composite-restoration', 'inlay-onlay', 'anterior-rct', 'premolar-rct', 'molar-rct', 're-rct',
  'rct-crown', 'pfm-crown', 'zirconia-crown', 'emax-crown', 'metal-crown', 'dental-bridge',
  'temporary-crown', 'simple-extraction', 'surgical-extraction', 'wisdom-tooth-extraction',
  'impacted-wisdom-tooth', 'complete-denture', 'partial-denture', 'flexible-denture',
  'implant-supported-denture', 'implant-placement', 'implant-abutment-crown', 'bone-grafting',
  'sinus-lift', 'metal-braces', 'ceramic-braces', 'self-ligating-braces', 'clear-aligners',
  'retainers', 'teeth-whitening', 'composite-veneers', 'porcelain-emax-veneers', 'smile-makeover',
  'child-consultation', 'fluoride-treatment', 'pulpotomy', 'stainless-steel-crown',
  'space-maintainer', 'deep-cleaning', 'root-planing', 'gum-surgery', 'periodontal-flap-surgery',
  'biopsy', 'cyst-removal', 'minor-oral-surgery', 'emergency-rct', 'dental-trauma',
  'nitrous-sedation', 'iv-sedation', 'special-needs-care', 'night-guard', 'sports-mouthguard',
  'dental-lab-custom-appliance',
] as const;

describe('registry covers the approved list', () => {
  it('registers every service slug the brief names, and no extras', () => {
    const registered = SERVICE_ASSETS.map((asset) => asset.slug).sort();
    expect(registered).toEqual([...BRIEF_SLUGS].sort());
  });

  it('registers the three banners', () => {
    expect(BANNER_ASSETS).toHaveLength(3);
  });

  it('has unique slugs', () => {
    expect(ASSET_BY_SLUG.size).toBe(IMAGE_ASSETS.length);
  });

  it('uses lower-case hyphenated slugs, which are also the filenames', () => {
    for (const asset of IMAGE_ASSETS) {
      expect(asset.slug, asset.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});

describe('accessibility (§24)', () => {
  it('gives every asset meaningful alt text', () => {
    for (const asset of IMAGE_ASSETS) {
      expect(asset.alt.length, asset.slug).toBeGreaterThan(8);
    }
  });

  it('does not use the slug as the alt text', () => {
    // "zirconia-crown" read aloud is not a description of an image.
    for (const asset of IMAGE_ASSETS) {
      expect(asset.alt.toLowerCase().replace(/[^a-z]/g, '')).not.toBe(
        asset.slug.replace(/-/g, ''),
      );
    }
  });

  it('writes distinct alt text for every asset', () => {
    const alts = IMAGE_ASSETS.map((asset) => asset.alt);
    expect(new Set(alts).size).toBe(alts.length);
  });
});

describe('mapping into the existing catalogue', () => {
  it('points every serviceSlug at a treatment that actually exists', () => {
    const known = new Set(CATALOGUE.flatMap((c) => c.services).map((s) => s.slug));
    for (const [serviceSlug, asset] of ASSET_BY_SERVICE_SLUG) {
      expect(known.has(serviceSlug), `${asset.slug} → ${serviceSlug}`).toBe(true);
    }
  });

  it('points every specialtyKey at a specialty that actually exists', () => {
    const known = new Set(DENTAL_SPECIALTIES.map((s) => s.key));
    for (const [key, asset] of ASSET_BY_SPECIALTY_KEY) {
      expect(known.has(key), `${asset.slug} → ${key}`).toBe(true);
    }
  });

  it('nominates an image for every one of the 12 specialties', () => {
    // Otherwise the category grid would show photographs for some categories
    // and not others, which reads as broken rather than as pending.
    for (const specialty of DENTAL_SPECIALTIES) {
      expect(ASSET_BY_SPECIALTY_KEY.has(specialty.key), specialty.key).toBe(true);
    }
  });

  it('never maps two assets to the same treatment', () => {
    const serviceSlugs = IMAGE_ASSETS.map((a) => a.serviceSlug).filter(Boolean);
    expect(new Set(serviceSlugs).size).toBe(serviceSlugs.length);
  });
});

describe('resolution while the files are absent', () => {
  it('resolves nothing, because no approved file has been delivered yet', () => {
    // This test flips to describing real files the moment they arrive and
    // `npm run assets:sync` has run; until then it documents the true state.
    for (const asset of IMAGE_ASSETS) {
      if (hasAsset(asset.slug)) continue;
      expect(resolveAsset(asset.slug)).toBeNull();
    }
  });

  it('returns null rather than throwing for an unknown slug', () => {
    // A typo in a component should leave a gap, not take the page down.
    expect(resolveAsset('no-such-image')).toBeNull();
    expect(resolveServiceAsset('no-such-service')).toBeNull();
    expect(resolveSpecialtyAsset('no-such-specialty')).toBeNull();
  });

  it('returns null for null and undefined', () => {
    expect(resolveAsset(null)).toBeNull();
    expect(resolveAsset(undefined)).toBeNull();
    expect(resolveServiceAsset(null)).toBeNull();
    expect(resolveSpecialtyAsset(undefined)).toBeNull();
  });
});

describe('dimensions (§23 — no layout shift)', () => {
  it('declares the banner size the brief specifies', () => {
    expect(ASSET_DIMENSIONS.banner).toEqual({ width: 1920, height: 600 });
  });

  it('declares a square service size', () => {
    expect(ASSET_DIMENSIONS.service.width).toBe(ASSET_DIMENSIONS.service.height);
  });
});

describe('auditAssets (§29)', () => {
  it('accounts for every registered asset exactly once', () => {
    const audit = auditAssets();
    expect(audit.total).toBe(IMAGE_ASSETS.length);
    expect(audit.present.length + audit.missing.length).toBe(audit.total);
    expect(new Set([...audit.present, ...audit.missing]).size).toBe(audit.total);
  });
});
