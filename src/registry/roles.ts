/**
 * TOOTHLOGY ROLE REGISTRY
 *
 * Roles bundle permissions. A principal's effective permission set is the union
 * of the permissions of every role assigned to them, plus the permissions of the
 * roles those roles inherit, resolved transitively.
 *
 * Two rules keep this from decaying into an unauditable mess:
 *
 * 1. Roles grant; they never deny. There is no negative permission. If a role
 *    should not have something, do not grant it — default deny does the rest
 *    (Constitution §9).
 * 2. Inheritance is acyclic and asserted by the registry integrity test. A cycle
 *    would make the effective permission set undecidable.
 *
 * `assignable: false` marks roles that no human may be granted through the admin
 * UI — `guest` is implicit for anonymous requests, and `system` belongs to
 * internal jobs only.
 */

import type { Role } from './types';

export const ROLES: readonly Role[] = [
  {
    id: 'TL-ROLE-GUEST-001',
    key: 'guest',
    name: 'Guest',
    description:
      'An anonymous visitor. Holds no permissions at all: every public surface must work without any permission check, so a public page grants access by requiring nothing rather than by granting something.',
    permissions: [],
    inherits: [],
    assignable: false,
  },
  {
    id: 'TL-ROLE-USER-001',
    key: 'user',
    name: 'Authenticated User',
    description:
      'The base role every authenticated principal holds, regardless of what kind of constituent they are. Grants control over your own account and nothing else.',
    permissions: [
      'tl.core.user.read.self',
      'tl.core.user.update.self',
      'tl.core.session.read.self',
      'tl.core.session.revoke.self',
      'tl.security.audit.read.self',
    ],
    inherits: [],
    assignable: false,
  },
  {
    id: 'TL-ROLE-PATIENT-001',
    key: 'patient',
    name: 'Patient',
    description:
      'A patient using Toothlogy to learn, discover, book and hold their own records. Record-specific permissions arrive with Division 11 in Phase 6.',
    permissions: [],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-DENTIST-001',
    key: 'dentist',
    name: 'Dentist',
    description:
      'A practising dentist with a professional profile. Manages their own profile and credentials; verification is decided by staff, never by the applicant.',
    permissions: [
      'tl.core.organization.read',
      'tl.dentist.profile.manage.self',
      'tl.dentist.pricing.manage.self',
    ],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-CLINIC-ADMIN-001',
    key: 'clinic_admin',
    name: 'Clinic Administrator',
    description:
      'Manages a clinic or hospital organization: its profile, staff, locations, services and the dentists who practise there. Scoped to organizations they belong to, never global.',
    permissions: [
      'tl.core.organization.read',
      'tl.core.organization.manage',
      'tl.clinic.practice.confirm',
      'tl.clinic.service.manage',
    ],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-CLINIC-STAFF-001',
    key: 'clinic_staff',
    name: 'Clinic Staff',
    description:
      'Front-desk and support staff at a clinic. Reads organization data; does not manage it.',
    permissions: ['tl.core.organization.read'],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-STUDENT-001',
    key: 'student',
    name: 'Student',
    description:
      'A dental student or intern. Learning, college and career permissions arrive with Divisions 06–08 in Phase 8.',
    permissions: [],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-SUPPLIER-001',
    key: 'supplier',
    name: 'Supplier',
    description:
      'A manufacturer, distributor, wholesaler, retailer or service provider. Catalogue and order permissions arrive with Divisions 16–19 in Phase 9.',
    permissions: ['tl.core.organization.read', 'tl.core.organization.manage'],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-SUPPORT-001',
    key: 'support_agent',
    name: 'Support Agent',
    description:
      'Platform support staff. May read user accounts to resolve tickets — a confidential, fully audited capability, deliberately separated from the ability to change anything.',
    permissions: ['tl.admin.console.access', 'tl.core.user.read.any'],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-MODERATOR-001',
    key: 'moderator',
    name: 'Moderator',
    description:
      'Reviews verification submissions and content. Holds review but NOT revoke: withdrawing a live verification removes a dentist from patient search, which is a heavier action reserved for administrators.',
    permissions: ['tl.admin.console.access', 'tl.verification.request.review'],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-ADMIN-001',
    key: 'platform_admin',
    name: 'Platform Administrator',
    description:
      'Full platform administration, including role assignment and feature-flag control. The smallest possible number of people hold this; every action is audited.',
    permissions: [
      'tl.core.user.read.any',
      'tl.core.user.suspend',
      'tl.core.role.assign',
      'tl.admin.console.access',
      'tl.admin.flag.read',
      'tl.admin.flag.manage',
      'tl.admin.registry.read',
      'tl.security.audit.read',
      'tl.devops.health.read',
      'tl.verification.request.review',
      'tl.verification.request.revoke',
      'tl.clinic.catalogue.read',
      'tl.clinic.catalogue.manage',
    ],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-SYSTEM-001',
    key: 'system',
    name: 'System',
    description:
      'Internal background jobs and scheduled tasks. Never assignable to a human, and never used to bypass a permission check that a human action would face.',
    permissions: [],
    inherits: [],
    assignable: false,
  },
] as const;

export const ROLE_BY_KEY: ReadonlyMap<string, Role> = new Map(ROLES.map((r) => [r.key, r]));

export type RoleKey = (typeof ROLES)[number]['key'];

/**
 * Resolve a role's full permission set, following `inherits` transitively.
 *
 * Cycles cannot occur — the registry integrity test forbids them — but the
 * `seen` set keeps this function total even if the registry is edited wrongly,
 * so a bad edit fails a test rather than hanging a request.
 */
export function resolveRolePermissions(
  roleKey: string,
  seen: Set<string> = new Set(),
): Set<string> {
  const out = new Set<string>();
  if (seen.has(roleKey)) return out;
  seen.add(roleKey);

  const role = ROLE_BY_KEY.get(roleKey);
  if (!role) return out;

  for (const p of role.permissions) out.add(p);
  for (const parent of role.inherits) {
    for (const p of resolveRolePermissions(parent, seen)) out.add(p);
  }
  return out;
}

/** Effective permissions for a principal holding several roles. */
export function resolvePermissionsForRoles(roleKeys: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const key of roleKeys) {
    for (const p of resolveRolePermissions(key)) out.add(p);
  }
  return out;
}
