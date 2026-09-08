/**
 * TL-TEST-RBAC-001 — Authorization
 *
 * Authorization bugs do not announce themselves: an over-permissive check looks
 * exactly like a working feature until someone notices they can read another
 * clinic's data. These tests target the failure directions that matter —
 * default deny, scope enforcement, and inheritance.
 */

import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS,
  type AuthenticatedPrincipal,
  can,
  canAll,
  canAny,
  effectiveOrganizationPermissions,
  effectivePermissions,
  requirePermission,
} from '@/platform/rbac';

function user(
  roles: string[],
  organizations: AuthenticatedPrincipal['organizations'] = [],
): AuthenticatedPrincipal {
  return {
    kind: 'user',
    userId: 'usr_test',
    sessionId: 'ses_test',
    roles,
    organizations,
  };
}

describe('default deny', () => {
  it('denies an anonymous principal everything', () => {
    expect(can(ANONYMOUS, 'tl.core.user.read.self')).toBe(false);
    expect(can(ANONYMOUS, 'tl.admin.console.access')).toBe(false);
    expect(effectivePermissions(ANONYMOUS).size).toBe(0);
  });

  it('denies an unregistered permission key', () => {
    // A typo must fail closed. The alternative — an unknown permission passing
    // because nothing matched it — is the worst possible default.
    const admin = user(['platform_admin']);
    expect(can(admin, 'tl.core.user.read.everything')).toBe(false);
    expect(can(admin, 'not.a.real.permission')).toBe(false);
    expect(can(admin, '')).toBe(false);
  });

  it('denies a user a permission no role grants them', () => {
    expect(can(user(['patient']), 'tl.admin.console.access')).toBe(false);
    expect(can(user(['patient']), 'tl.core.role.assign')).toBe(false);
  });

  it('grants a system principal nothing by default', () => {
    // Internal jobs act through named capabilities, not a wildcard. "It's
    // internal, let it through" is how audit trails stop meaning anything.
    expect(can({ kind: 'system', actor: 'relay' }, 'tl.core.user.read.any')).toBe(false);
  });
});

describe('role inheritance', () => {
  it('resolves inherited permissions transitively', () => {
    // `patient` inherits `user`, which grants self-scoped account access.
    expect(can(user(['patient']), 'tl.core.user.read.self')).toBe(true);
    expect(can(user(['patient']), 'tl.core.session.revoke.self')).toBe(true);
  });

  it('unions permissions across several roles', () => {
    const both = user(['patient', 'clinic_admin']);
    expect(can(both, 'tl.core.user.read.self')).toBe(true);
    expect(effectivePermissions(both).has('tl.core.organization.manage')).toBe(true);
  });

  it('gives a platform admin the administrative permissions', () => {
    const admin = user(['platform_admin']);
    expect(can(admin, 'tl.core.role.assign')).toBe(true);
    expect(can(admin, 'tl.security.audit.read')).toBe(true);
    expect(can(admin, 'tl.admin.flag.manage')).toBe(true);
  });

  it('ignores an unknown role rather than throwing', () => {
    // A stale role assignment in the database must not crash every request the
    // affected user makes — it should simply grant nothing.
    expect(() => effectivePermissions(user(['no_such_role']))).not.toThrow();
    expect(can(user(['no_such_role']), 'tl.core.user.read.self')).toBe(false);
  });
});

describe('organization scope', () => {
  const clinicAdmin = user(
    ['user'],
    [{ organizationId: 'org_alpha', roles: ['clinic_admin'] }],
  );

  it('grants an organization permission inside that organization', () => {
    expect(can(clinicAdmin, 'tl.core.organization.manage', { organizationId: 'org_alpha' })).toBe(
      true,
    );
  });

  it('denies the same permission in a different organization', () => {
    // The most likely serious authorization bug in a multi-tenant product:
    // one clinic's administrator managing another clinic.
    expect(can(clinicAdmin, 'tl.core.organization.manage', { organizationId: 'org_beta' })).toBe(
      false,
    );
  });

  it('denies an organization permission when no organization is named', () => {
    // An unanswerable authorization question is a denial, not a pass.
    expect(can(clinicAdmin, 'tl.core.organization.manage')).toBe(false);
  });

  it('does not leak organization roles into the global permission set', () => {
    expect(effectivePermissions(clinicAdmin).has('tl.core.organization.manage')).toBe(false);
    expect(
      effectiveOrganizationPermissions(clinicAdmin, 'org_alpha').has('tl.core.organization.manage'),
    ).toBe(true);
  });
});

describe('self scope', () => {
  it('allows action on the principal\'s own resource', () => {
    const patient = user(['patient']);
    expect(can(patient, 'tl.core.user.update.self', { subjectUserId: 'usr_test' })).toBe(true);
  });

  it('denies action on another user\'s resource', () => {
    const patient = user(['patient']);
    expect(can(patient, 'tl.core.user.update.self', { subjectUserId: 'usr_someone_else' })).toBe(
      false,
    );
  });
});

describe('enforcement helpers', () => {
  it('throws UNAUTHENTICATED for anonymous and FORBIDDEN for authenticated', () => {
    // The distinction matters to clients: 401 means "sign in", 403 means
    // "signing in again will not help".
    expect(() => requirePermission(ANONYMOUS, 'tl.core.user.read.self')).toThrow(
      /authentication is required/i,
    );
    expect(() => requirePermission(user(['patient']), 'tl.core.role.assign')).toThrow(
      /do not have permission/i,
    );
  });

  it('names the missing permission in the error', () => {
    try {
      requirePermission(user(['patient']), 'tl.core.role.assign');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('tl.core.role.assign');
    }
  });

  it('does not throw when permitted', () => {
    expect(() => requirePermission(user(['patient']), 'tl.core.user.read.self')).not.toThrow();
  });

  it('evaluates canAll and canAny correctly', () => {
    const admin = user(['platform_admin']);
    expect(canAll(admin, ['tl.security.audit.read', 'tl.admin.flag.read'])).toBe(true);
    expect(canAll(admin, ['tl.security.audit.read', 'tl.core.organization.manage'])).toBe(false);
    expect(canAny(admin, ['tl.core.organization.manage', 'tl.admin.flag.read'])).toBe(true);
    expect(canAny(user(['patient']), ['tl.core.role.assign', 'tl.security.audit.read'])).toBe(false);
  });

  it('treats an empty permission list as permitted', () => {
    // Mirrors the API registry: `permissions: []` is an explicit public route.
    expect(canAll(ANONYMOUS, [])).toBe(true);
  });
});
