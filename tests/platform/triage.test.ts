/**
 * TL-TEST-TRIAGE-001 — concern routing: every key is real, safety questions
 * override everything, the most urgent concern decides, a child goes to a
 * children's dentist first, and nothing outside the closed lists is accepted.
 */

import { describe, expect, it } from 'vitest';
import { CONCERNS, RED_FLAGS, routeConcerns } from '@/platform/triage/rules';
import { DENTAL_SPECIALTIES } from '@/platform/dentists/specialties';
import { TREATMENT_BY_KEY } from '@/platform/catalogue/treatments';

describe('concern routing rules', () => {
  it('only name specialties /find filters on and treatments in the catalogue', () => {
    const specialties = new Set(DENTAL_SPECIALTIES.map((s) => s.key));
    const missing = CONCERNS.flatMap((c) => [...c.specialties.filter((s) => !specialties.has(s)).map((s) => `${c.key} → specialty ${s}`), ...c.treatments.filter((t) => !TREATMENT_BY_KEY.has(t)).map((t) => `${c.key} → treatment ${t}`)]);
    expect(missing).toEqual([]);
    expect(specialties.has('pedodontics')).toBe(true);
    expect(new Set(CONCERNS.map((c) => c.key)).size).toBe(CONCERNS.length);
    expect(new Set(RED_FLAGS.map((f) => f.key)).size).toBe(RED_FLAGS.length);
  });

  it('gives every catalogue treatment a specialty from the list /find filters on', () => {
    // Found while building the router: treatments once named specialties
    // (pediatric_dentistry, oral_maxillofacial_surgery, oral_medicine) that
    // the specialty list does not have. Nothing read them yet; this keeps it so.
    const specialties = new Set(DENTAL_SPECIALTIES.map((s) => s.key));
    const orphans = [...TREATMENT_BY_KEY.values()].filter((t) => t.specialtyKey && !specialties.has(t.specialtyKey)).map((t) => `${t.key} → ${t.specialtyKey}`);
    expect(orphans).toEqual([]);
  });

  it('sends anyone with a safety concern to emergency care, with no search offered first', () => {
    const route = routeConcerns({ concerns: ['checkup'], redFlags: ['breathing'] });
    expect(route.urgency).toBe('EMERGENCY_NOW');
    expect(route.findQuery).toBeNull();
    expect(routeConcerns({ concerns: [], redFlags: ['bleeding'] }).urgency).toBe('EMERGENCY_NOW');
  });

  it('lets the most urgent concern decide, and asks for dentists who see emergencies when it cannot wait', () => {
    const route = routeConcerns({ concerns: ['checkup', 'knocked_out'], redFlags: [] });
    expect(route.urgency).toBe('WITHIN_THE_HOUR');
    expect(route.findQuery).toBe('specialty=general_dentistry&emergency=1');
    expect(route.notes[0]).toMatch(/within the hour/);
    expect(routeConcerns({ concerns: ['toothache', 'bad_breath'], redFlags: [] }).urgency).toBe('SOON');
    const braces = routeConcerns({ concerns: ['crooked_teeth'], redFlags: [] });
    expect(braces).toMatchObject({ urgency: 'ROUTINE', findQuery: 'specialty=orthodontics' });
    expect(braces.treatments).toEqual(['metal_braces', 'clear_aligners']);
  });

  it('puts a children’s dentist first for a child, and lists each kind of dentist once', () => {
    const route = routeConcerns({ concerns: ['toothache', 'broken_tooth'], redFlags: [], forChild: true });
    expect(route.specialties).toEqual(['pedodontics', 'general_dentistry', 'endodontics', 'prosthodontics']);
    expect(route.findQuery).toBe('specialty=pedodontics');
  });

  it('refuses anything outside the closed lists', () => {
    expect(() => routeConcerns({ concerns: ['headache'], redFlags: [] })).toThrow(RangeError);
    expect(() => routeConcerns({ concerns: ['checkup'], redFlags: ['anxious'] })).toThrow(RangeError);
    expect(() => routeConcerns({ concerns: [], redFlags: [] })).toThrow(RangeError);
  });
});
