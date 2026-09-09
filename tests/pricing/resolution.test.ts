/**
 * Clinic / dentist / catalogue price priority (specification §7).
 */

import { describe, expect, it } from 'vitest';
import {
  GLOBAL_SCOPE_KEY,
  resolvePriceList,
  resolveServicePrice,
  scopeKeyFor,
  variantKeyFor,
} from '@/platform/pricing/resolution';

const row = (
  id: string,
  locationId: string | null,
  overrides: Partial<{ isEnabled: boolean; serviceId: string }> = {},
) => ({
  id,
  serviceId: overrides.serviceId ?? 'csvc_crown',
  locationId,
  isEnabled: overrides.isEnabled ?? true,
  isPublicVisible: true,
});

describe('resolveServicePrice', () => {
  const globalRow = row('dsp_global', null);
  const delhi = row('dsp_delhi', 'loc_delhi');
  const gurgaon = row('dsp_gurgaon', 'loc_gurgaon');

  it('prefers the clinic-specific price', () => {
    const result = resolveServicePrice([globalRow, delhi, gurgaon], 'loc_delhi');
    expect(result.source).toBe('clinic');
    expect(result.row?.id).toBe('dsp_delhi');
  });

  it('falls back to the dentist-global price at a clinic with no override', () => {
    const result = resolveServicePrice([globalRow, delhi], 'loc_gurgaon');
    expect(result.source).toBe('dentist');
    expect(result.row?.id).toBe('dsp_global');
  });

  it('falls back to the catalogue when the dentist has priced nothing', () => {
    expect(resolveServicePrice([], 'loc_delhi').source).toBe('catalogue');
  });

  it('never returns a clinic-specific price as the dentist-general price', () => {
    // Asking "what does this dentist generally charge" must not be answered
    // with a price that only applies in Gurgaon.
    const result = resolveServicePrice([gurgaon], null);
    expect(result.source).toBe('catalogue');
    expect(result.row).toBeNull();
  });

  it('ignores disabled rows and falls through past them', () => {
    const disabledClinic = row('dsp_delhi', 'loc_delhi', { isEnabled: false });
    const result = resolveServicePrice([globalRow, disabledClinic], 'loc_delhi');
    expect(result.source).toBe('dentist');
  });
});

describe('resolvePriceList', () => {
  it('yields one entry per service, not one per row', () => {
    // A global row plus a clinic override for the same crown is one crown.
    const rows = [
      row('dsp_global', null),
      row('dsp_delhi', 'loc_delhi'),
      row('dsp_other', null, { serviceId: 'csvc_rct' }),
    ];
    const resolved = resolvePriceList(rows, 'loc_delhi');
    expect(resolved.size).toBe(2);
    expect(resolved.get('csvc_crown')?.row?.id).toBe('dsp_delhi');
    expect(resolved.get('csvc_rct')?.source).toBe('dentist');
  });
});

describe('scope keys', () => {
  it('maps a null location to the global sentinel', () => {
    expect(scopeKeyFor(null)).toBe(GLOBAL_SCOPE_KEY);
    expect(scopeKeyFor(undefined)).toBe(GLOBAL_SCOPE_KEY);
    expect(scopeKeyFor('loc_delhi')).toBe('loc_delhi');
  });

  it('uses a sentinel that cannot collide with a real id', () => {
    // Record ids are prefixed ULIDs and never begin with an underscore.
    expect(GLOBAL_SCOPE_KEY.startsWith('_')).toBe(true);
    expect(variantKeyFor(null).startsWith('_')).toBe(true);
    expect(variantKeyFor('svar_zirconia')).toBe('svar_zirconia');
  });
});
