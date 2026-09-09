/**
 * TOOTHLOGY PERMISSION REGISTRY
 *
 * Permission keys are dotted and structured:
 *
 *     tl.<division-slug>.<resource>.<action>[.<qualifier>]
 *
 * Keys are stable and never reused (Constitution P6). Renaming a permission is a
 * breaking change: it silently widens or narrows access, so it requires a
 * migration of every RoleAssignment that referenced it.
 *
 * SCOPE decides *what* the permission is evaluated against:
 *   - 'self'          the principal's own resource only
 *   - 'organization'  resources belonging to an organization the principal is a member of
 *   - 'global'        platform-wide; only ever granted to staff roles
 *
 * This registry contains the FOUNDATION permissions only — those the Phase 0/1
 * platform actually evaluates. Each division adds its own permissions in its own
 * phase. Registering a permission here is not a claim that any feature uses it.
 */

import type { Permission } from './types';

export const PERMISSIONS: readonly Permission[] = [
  // --- Division 01: Core — identity and account ---------------------------
  {
    key: 'tl.core.user.read.self',
    description: 'Read your own user account and profile.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'self',
    sensitivity: 'internal',
  },
  {
    key: 'tl.core.user.update.self',
    description: 'Update your own user account and profile.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'self',
    sensitivity: 'internal',
  },
  {
    key: 'tl.core.user.read.any',
    description: 'Read any user account. Staff-only; every use is audited.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.core.user.suspend',
    description: 'Suspend or reinstate a user account.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.core.session.read.self',
    description: 'List your own active sessions.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'self',
    sensitivity: 'internal',
  },
  {
    key: 'tl.core.session.revoke.self',
    description: 'Revoke your own sessions on any device.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'self',
    sensitivity: 'internal',
  },
  {
    key: 'tl.core.organization.read',
    description: 'Read organizations you are a member of.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.core.organization.manage',
    description: 'Manage organization settings and membership.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.core.role.assign',
    description: 'Assign or revoke roles. The most privilege-sensitive permission in the platform.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'global',
    sensitivity: 'confidential',
  },

  // --- Division 33: Security & Compliance ---------------------------------
  {
    key: 'tl.security.audit.read',
    description: 'Read the append-only audit log.',
    divisionId: 'TL-DIV-33-SECURITY',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.security.audit.read.self',
    description: 'Read audit entries about your own account and data.',
    divisionId: 'TL-DIV-33-SECURITY',
    scope: 'self',
    sensitivity: 'internal',
  },

  // --- Division 32: Administration ----------------------------------------
  {
    key: 'tl.admin.console.access',
    description: 'Access the internal administration console at all.',
    divisionId: 'TL-DIV-32-ADMIN',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.admin.flag.read',
    description: 'Read feature-flag state.',
    divisionId: 'TL-DIV-32-ADMIN',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.admin.flag.manage',
    description: 'Change feature-flag state. Gated behind the console-access permission.',
    divisionId: 'TL-DIV-32-ADMIN',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.admin.registry.read',
    description: 'Read the architecture registry through the introspection API.',
    divisionId: 'TL-DIV-32-ADMIN',
    scope: 'global',
    sensitivity: 'internal',
  },

  // --- Division 35: DevOps & System ---------------------------------------
  {
    key: 'tl.devops.health.read',
    description: 'Read detailed system health, including dependency status.',
    divisionId: 'TL-DIV-35-DEVOPS',
    scope: 'global',
    sensitivity: 'internal',
  },

  // --- Division 04: Dentists (Phase 3) ------------------------------------
  {
    key: 'tl.dentist.profile.manage.self',
    description: 'Create and edit your own dentist profile, qualifications and practices.',
    divisionId: 'TL-DIV-04-DENTISTS',
    scope: 'self',
    sensitivity: 'internal',
  },

  // --- Division 05: Clinics (Phase 3) -------------------------------------
  {
    key: 'tl.clinic.practice.confirm',
    description:
      'Confirm that a dentist practises at one of this organization’s locations. Without confirmation any dentist could claim to work anywhere.',
    divisionId: 'TL-DIV-05-CLINICS',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.clinic.service.manage',
    description: 'Manage the treatments and prices offered at this organization’s locations.',
    divisionId: 'TL-DIV-05-CLINICS',
    scope: 'organization',
    sensitivity: 'internal',
  },

  {
    key: 'tl.clinic.catalogue.read',
    description:
      'Read the master treatment catalogue, including draft and archived entries. The public read needs no permission; this covers the administration view.',
    divisionId: 'TL-DIV-05-CLINICS',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.clinic.catalogue.manage',
    description:
      'Create and edit master treatment categories, services, variants and their suggested price ranges. Staff-only and deliberately separate from tl.clinic.service.manage: a dentist who could edit the master range could move the reference their own price is compared against.',
    divisionId: 'TL-DIV-05-CLINICS',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.dentist.pricing.manage.self',
    description:
      'Create and edit your own treatment prices, at your own confirmed clinics. Scoped to self: the dentist profile is resolved from the session, never from the request.',
    divisionId: 'TL-DIV-04-DENTISTS',
    scope: 'self',
    sensitivity: 'internal',
  },

  // --- Division 26: Reviews & Trust (Phase 3 verification) ----------------
  {
    key: 'tl.verification.request.review',
    description:
      'Approve or reject verification requests. Staff-only, and a reviewer may never decide their own application.',
    divisionId: 'TL-DIV-26-REVIEWS',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.verification.request.revoke',
    description:
      'Withdraw an approved verification. Separated from review because revocation removes a live dentist from patient search.',
    divisionId: 'TL-DIV-26-REVIEWS',
    scope: 'global',
    sensitivity: 'confidential',
  },
] as const;

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export const PERMISSION_BY_KEY: ReadonlyMap<string, Permission> = new Map(
  PERMISSIONS.map((p) => [p.key, p]),
);

export function isKnownPermission(key: string): boolean {
  return PERMISSION_BY_KEY.has(key);
}
