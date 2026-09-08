/**
 * TL-TEST-REGISTRY-001 — Registry integrity
 *
 * This suite tests the *architecture*, not the code.
 *
 * Its job is to make the registry incapable of quietly becoming fiction. A
 * module pointing at a deleted division, a role inheriting from a role that no
 * longer exists, a duplicated ID, a test suite listed but never written — each
 * of those is the kind of documentation rot that only surfaces when someone
 * relies on it. Here they fail a test instead.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateRegistry } from '@/registry/validate';
import { DIVISIONS } from '@/registry/divisions';
import { MODULES } from '@/registry/modules';
import { TEST_SUITES } from '@/registry/tests';
import { PERMISSIONS } from '@/registry/permissions';
import { ROLES, resolveRolePermissions } from '@/registry/roles';
import { CERTIFICATION_DIMENSIONS } from '@/registry/types';
import { DELIVERED_THROUGH_PHASE } from '@/registry';

describe('registry integrity', () => {
  it('has no cross-reference, uniqueness or grammar violations', () => {
    const issues = validateRegistry();

    // Printed in full on failure: with several issues at once, a bare count
    // would mean fixing them one failed run at a time.
    expect(
      issues,
      `Registry integrity issues:\n${issues
        .map((i) => `  [${i.registry}] ${i.subject}: ${i.message}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('covers all 35 divisions with unique, sequential numbers', () => {
    expect(DIVISIONS).toHaveLength(35);

    const numbers = DIVISIONS.map((d) => d.number).sort();
    const expected = Array.from({ length: 35 }, (_, i) => String(i + 1).padStart(2, '0'));
    expect(numbers).toEqual(expected);
  });

  it('maps every module to at least one pillar', () => {
    // Constitution §2.1 — the mechanical form of "a feature that maps to no
    // pillar does not belong in Toothlogy".
    const unmapped = MODULES.filter((m) => m.pillars.length === 0);
    expect(unmapped.map((m) => m.id)).toEqual([]);
  });

  it('declares every registered test suite as a file that exists', () => {
    // Without this check the test registry could claim coverage that was never
    // written — which is exactly the false-completeness Constitution P9 forbids.
    const missing = TEST_SUITES.filter(
      (suite) => !existsSync(resolve(process.cwd(), suite.path)),
    );
    expect(missing.map((s) => `${s.id} → ${s.path}`)).toEqual([]);
  });

  it('resolves role inheritance without cycles or unknown permissions', () => {
    const permissionKeys = new Set(PERMISSIONS.map((p) => p.key));

    for (const role of ROLES) {
      // Terminates only if inheritance is acyclic.
      const resolved = resolveRolePermissions(role.key);
      for (const permission of resolved) {
        expect(permissionKeys.has(permission), `${role.key} grants unknown '${permission}'`).toBe(
          true,
        );
      }
    }
  });

  it('gives an authenticated user only self-scoped permissions', () => {
    // A regression guard on the most consequential possible registry mistake:
    // accidentally granting a global permission to the base role every signed-in
    // user holds.
    const userPermissions = resolveRolePermissions('user');
    const byKey = new Map(PERMISSIONS.map((p) => [p.key, p]));

    for (const key of userPermissions) {
      expect(byKey.get(key)?.scope, `base 'user' role holds non-self permission '${key}'`).toBe(
        'self',
      );
    }
  });

  it('gives the guest role no permissions at all', () => {
    expect([...resolveRolePermissions('guest')]).toEqual([]);
  });

  it('defines exactly the 21 certification dimensions', () => {
    expect(CERTIFICATION_DIMENSIONS).toHaveLength(21);
  });

  it('marks nothing implemented beyond the delivered phase', () => {
    /*
     * Honest state reporting (Constitution P9), mechanically enforced.
     *
     * `DELIVERED_THROUGH_PHASE` is the single claim about how far the build has
     * got. If a module for a later phase is marked `implemented`, either that
     * phase really was delivered — in which case the constant should be raised
     * deliberately — or the claim is false. Both deserve a failing test, and
     * this is what stops progress being overstated one module at a time.
     */
    const premature = MODULES.filter(
      (m) => m.status === 'implemented' && m.phase > DELIVERED_THROUGH_PHASE,
    );

    expect(
      premature.map((m) => `${m.id} (phase ${m.phase})`),
      `Modules marked implemented beyond delivered phase ${DELIVERED_THROUGH_PHASE}`,
    ).toEqual([]);
  });

  it('has delivered at least one module in every phase it claims', () => {
    // The other direction: the constant must not run ahead of the work either.
    for (let phase = 1; phase <= DELIVERED_THROUGH_PHASE; phase += 1) {
      const delivered = MODULES.filter((m) => m.phase === phase && m.status === 'implemented');
      expect(delivered.length, `Phase ${phase} is claimed delivered but has no modules`).
        toBeGreaterThan(0);
    }
  });
});
