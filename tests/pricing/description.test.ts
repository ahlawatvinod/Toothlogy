/**
 * Description resolution and fallback (specification §9, §10).
 */

import { describe, expect, it } from 'vitest';
import {
  DESCRIPTION_MAX,
  normalizeDescription,
  resolveDescription,
  resolveShortDescription,
  validateDescription,
} from '@/platform/pricing/description';

describe('resolveDescription — the four-level chain', () => {
  const all = {
    dentistVariant: 'Our zirconia crowns are milled in-house.',
    dentistService: 'We fit crowns in two visits.',
    masterVariant: 'A durable, tooth-coloured crown made from zirconia.',
    masterService: 'A cap fitted over a tooth to protect and rebuild it.',
  };

  it('prefers the dentist’s wording for the variant', () => {
    const result = resolveDescription(all);
    expect(result.text).toBe(all.dentistVariant);
    expect(result.source).toBe('dentist_variant');
    expect(result.isCustom).toBe(true);
  });

  it('falls back to the dentist’s wording for the service', () => {
    const result = resolveDescription({ ...all, dentistVariant: null });
    expect(result.source).toBe('dentist_service');
    expect(result.isCustom).toBe(true);
  });

  it('falls back to the master variant description', () => {
    const result = resolveDescription({ ...all, dentistVariant: null, dentistService: null });
    expect(result.source).toBe('master_variant');
    expect(result.isCustom).toBe(false);
  });

  it('falls back to the master service description', () => {
    const result = resolveDescription({ masterService: all.masterService });
    expect(result.source).toBe('master_service');
    expect(result.isCustom).toBe(false);
  });

  it('reports nothing rather than a placeholder when every level is empty', () => {
    const result = resolveDescription({});
    expect(result.text).toBeNull();
    expect(result.source).toBe('none');
  });

  it('treats whitespace as absent, so a cleared field falls through', () => {
    // A dentist who empties the box must get the master text back, not a blank
    // paragraph where it used to be.
    const result = resolveDescription({ dentistVariant: '   \n ', masterService: 'Master text.' });
    expect(result.text).toBe('Master text.');
    expect(result.source).toBe('master_service');
  });

  it('trims the text it returns', () => {
    expect(resolveDescription({ masterService: '  padded  ' }).text).toBe('padded');
  });

  it('marks provenance so the UI can say who wrote it', () => {
    expect(resolveDescription({ dentistService: 'ours' }).isCustom).toBe(true);
    expect(resolveDescription({ masterService: 'theirs' }).isCustom).toBe(false);
  });
});

describe('resolveShortDescription', () => {
  it('prefers a purpose-written short description', () => {
    const result = resolveShortDescription({
      masterServiceShort: 'Strong, tooth-coloured crown for restoring damaged teeth.',
      masterService: 'A much longer description that goes on at some length indeed.',
    });
    expect(result.text).toBe('Strong, tooth-coloured crown for restoring damaged teeth.');
  });

  it('falls back to the long description when no short one exists', () => {
    const result = resolveShortDescription({ masterService: 'Short enough.' });
    expect(result.text).toBe('Short enough.');
  });

  it('truncates on a word boundary rather than mid-word', () => {
    const long = 'A zirconia crown is a strong tooth coloured dental crown used to restore teeth';
    const result = resolveShortDescription({ masterService: long }, 30);

    expect(result.text).toMatch(/…$/);
    expect(result.text!.length).toBeLessThanOrEqual(31);

    const kept = result.text!.replace('…', '');
    // What is kept is a genuine prefix of the original...
    expect(long.startsWith(kept)).toBe(true);
    // ...and the original continues with a space, so the cut fell between two
    // words rather than through the middle of one.
    expect(long[kept.length]).toBe(' ');
  });

  it('leaves a single long word alone rather than slicing through it', () => {
    const result = resolveShortDescription({ masterService: 'Supercalifragilistic' }, 10);
    expect(result.text).toBe('Supercalif…');
  });

  it('reports none when there is nothing at any level', () => {
    expect(resolveShortDescription({}).source).toBe('none');
  });
});

describe('normalizeDescription', () => {
  it('turns an empty or whitespace string into null', () => {
    // "Cleared by the dentist" and "never set" must be the same state, or the
    // chain stops at an empty string.
    expect(normalizeDescription('')).toBeNull();
    expect(normalizeDescription('   ')).toBeNull();
  });

  it('trims real content', () => {
    expect(normalizeDescription('  text  ')).toBe('text');
  });

  it('passes null and undefined through', () => {
    expect(normalizeDescription(null)).toBeNull();
    expect(normalizeDescription(undefined)).toBeNull();
  });
});

describe('validateDescription', () => {
  it('accepts an absent description', () => {
    expect(validateDescription(null, 'customDescription')).toBeNull();
  });

  it('accepts one at the limit', () => {
    expect(validateDescription('x'.repeat(DESCRIPTION_MAX), 'customDescription')).toBeNull();
  });

  it('rejects one over the limit, and says by how much', () => {
    const issue = validateDescription('x'.repeat(DESCRIPTION_MAX + 5), 'customDescription');
    expect(issue?.field).toBe('customDescription');
    expect(issue?.message).toContain(String(DESCRIPTION_MAX));
  });
});
