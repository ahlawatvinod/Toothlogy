/**
 * /find parameters. A search link is edited by hand and shared; a bad value
 * must be ignored and said so, never turned into an error page — and never
 * let through as a filter the search API would refuse.
 */

import { describe, expect, it } from 'vitest';
import { parseFindQuery, toSearchQuery } from '@/platform/discovery/find-query';

describe('find query', () => {
  it('defaults to dentists, relevance and a 25 km radius', () => {
    const q = parseFindQuery({});
    expect(q.type).toBe('dentist');
    expect(q.sort).toBe('relevance');
    expect(q.radiusKm).toBe(25);
    expect(q.filters).toEqual([]);
  });

  it('sorts by distance when a place is given without text', () => {
    expect(parseFindQuery({ near: 'Raipur' }).sort).toBe('distance');
    expect(parseFindQuery({ near: 'Raipur', q: 'root canal' }).sort).toBe('relevance');
    expect(parseFindQuery({ lat: '21.25', lng: '81.63' }).sort).toBe('distance');
  });

  it('builds allow-listed filters and converts the fee to minor units', () => {
    const q = parseFindQuery({ specialty: 'endodontics', language: 'hi', appointmentType: 'VIDEO', emergency: '1', feeMax: '500' });
    expect(q.filters).toEqual([
      { field: 'specialty', operator: 'eq', value: 'endodontics' },
      { field: 'language', operator: 'eq', value: 'hi' },
      { field: 'appointmentTypes', operator: 'eq', value: 'VIDEO' },
      { field: 'emergency', operator: 'eq', value: 'true' },
      { field: 'fee', operator: 'lte', value: 50_000 },
    ]);
    expect(q.notices).toEqual([]);
  });

  it('applies only the filters a clinic search allows', () => {
    const q = parseFindQuery({ type: 'clinic', language: 'hi', treatment: 'root_canal_treatment', feeMax: '500', sort: 'price_asc' });
    expect(q.filters).toEqual([{ field: 'treatment', operator: 'eq', value: 'root_canal_treatment' }]);
    expect(q.sort).toBe('relevance');
  });

  it('ignores malformed values with a notice', () => {
    const q = parseFindQuery({ specialty: "x' OR 1=1", appointmentType: 'TELEPORT', feeMax: 'free', lat: '999', lng: '1' });
    expect(q.filters).toEqual([]);
    expect(q.point).toBeNull();
    expect(q.notices).toHaveLength(4);
  });

  it('accepts only the offered radii', () => {
    expect(parseFindQuery({ radius: '10' }).radiusKm).toBe(10);
    expect(parseFindQuery({ radius: '9999' }).radiusKm).toBe(25);
  });

  it('never asks for distance order without a centre point', () => {
    const q = parseFindQuery({ sort: 'distance' });
    expect(toSearchQuery(q, null).sort).toBe('relevance');
    expect(toSearchQuery(q, { latitude: 21.25, longitude: 81.63 }).geo?.radiusMetres).toBe(25_000);
  });
});
