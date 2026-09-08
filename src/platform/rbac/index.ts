/**
 * TOOTHLOGY AUTHORIZATION (RBAC)
 *
 * One decision point for "may this principal do this?" (Constitution P7).
 *
 * The model is deliberately small, because authorization logic that is clever is
 * authorization logic nobody can audit:
 *
 *   principal → roles → permissions, evaluated against a scope
 *
 * Three rules define it:
 *
 * 1. **Default deny.** `can()` returns false unless a granted permission
 *    matches. There is no "allow unless denied" path, so a permission that was
 *    never granted cannot be reached by accident (Constitution §9).
 * 2. **Roles grant; nothing denies.** There are no negative permissions, so the
 *    effective permission set is a plain union and cannot depend on evaluation
 *    order.
 * 3. **Scope is checked, not assumed.** A permission scoped to `organization`
 *    only applies to organizations the principal belongs to. This is the check
 *    that stops one clinic's administrator from managing another clinic — the
 *    most likely serious authorization bug in a multi-tenant product.
 */

import { PERMISSION_BY_KEY } from '@/registry/permissions';
import { resolvePermissionsForRoles } from '@/registry/roles';
import { errors } from '../kernel/errors';

/** An organization membership held by a principal. */
export interface OrganizationMembership {
  readonly organizationId: string;
  /** Role keys held within this organization specifically. */
  readonly roles: readonly string[];
}

/**
 * The authenticated (or anonymous) actor behind a request.
 *
 * `AnonymousPrincipal` is a real object rather than `null` on purpose: code that
 * handles a nullable principal tends to grow `if (user)` branches where the
 * else-branch quietly skips the permission check. With a principal that always
 * exists and holds no permissions, the same check runs for everyone and simply
 * denies.
 */
export interface AuthenticatedPrincipal {
  readonly kind: 'user';
  readonly userId: string;
  /** Global role keys. */
  readonly roles: readonly string[];
  readonly organizations: readonly OrganizationMembership[];
  readonly sessionId: string;
}

export interface AnonymousPrincipal {
  readonly kind: 'anonymous';
}

export interface SystemPrincipal {
  readonly kind: 'system';
  /** What internal job is acting, recorded in the audit trail. */
  readonly actor: string;
}

export type Principal = AuthenticatedPrincipal | AnonymousPrincipal | SystemPrincipal;

export const ANONYMOUS: AnonymousPrincipal = { kind: 'anonymous' };

export function isAuthenticated(p: Principal): p is AuthenticatedPrincipal {
  return p.kind === 'user';
}

/** Where a permission is being evaluated. */
export interface AuthorizationContext {
  /** For `organization`-scoped permissions: which organization. */
  readonly organizationId?: string;
  /** For `self`-scoped permissions: whose resource is being touched. */
  readonly subjectUserId?: string;
}

/**
 * The effective global permission set for a principal.
 *
 * A system principal receives nothing here by design: internal jobs act through
 * explicit, named capabilities rather than by holding a wildcard. "The job is
 * internal, so let it through" is how audit trails become meaningless.
 */
export function effectivePermissions(principal: Principal): ReadonlySet<string> {
  if (principal.kind !== 'user') return new Set();
  return resolvePermissionsForRoles(principal.roles);
}

/** Permissions a principal holds inside one organization, including global ones. */
export function effectiveOrganizationPermissions(
  principal: Principal,
  organizationId: string,
): ReadonlySet<string> {
  if (principal.kind !== 'user') return new Set();

  const combined = new Set(resolvePermissionsForRoles(principal.roles));
  const membership = principal.organizations.find((o) => o.organizationId === organizationId);
  if (membership) {
    for (const permission of resolvePermissionsForRoles(membership.roles)) combined.add(permission);
  }
  return combined;
}

/**
 * The authorization decision.
 *
 * Returns a boolean rather than throwing so callers can also use it for
 * conditional rendering — hiding an action a user cannot perform is a UX
 * concern, and it should never require a try/catch. `require()` is the throwing
 * form for enforcement.
 */
export function can(
  principal: Principal,
  permission: string,
  context: AuthorizationContext = {},
): boolean {
  const definition = PERMISSION_BY_KEY.get(permission);

  // An unregistered permission denies. A typo in a permission string must fail
  // closed — the alternative is a check that silently passes for everyone.
  if (!definition) return false;

  if (principal.kind === 'anonymous') return false;

  // System principals hold only what a caller explicitly granted them, which is
  // nothing by default; see effectivePermissions.
  if (principal.kind === 'system') return false;

  switch (definition.scope) {
    case 'global':
      return effectivePermissions(principal).has(permission);

    case 'organization': {
      // Without a named organization the question is unanswerable, and an
      // unanswerable authorization question is a denial, not a pass.
      if (!context.organizationId) return false;
      const isMember = principal.organizations.some(
        (o) => o.organizationId === context.organizationId,
      );
      if (!isMember) return false;
      return effectiveOrganizationPermissions(principal, context.organizationId).has(permission);
    }

    case 'self': {
      // Self-scoped permissions apply to the principal's own resources. When no
      // subject is named the principal is acting on itself, which is allowed.
      if (context.subjectUserId && context.subjectUserId !== principal.userId) return false;
      return effectivePermissions(principal).has(permission);
    }

    default:
      return false;
  }
}

/** Enforcing form of `can`. Throws UNAUTHENTICATED or FORBIDDEN. */
export function requirePermission(
  principal: Principal,
  permission: string,
  context: AuthorizationContext = {},
): void {
  if (principal.kind === 'anonymous') throw errors.unauthenticated();
  if (!can(principal, permission, context)) throw errors.forbidden(permission);
}

/** True when the principal holds every listed permission. */
export function canAll(
  principal: Principal,
  permissions: readonly string[],
  context: AuthorizationContext = {},
): boolean {
  return permissions.every((p) => can(principal, p, context));
}

/** True when the principal holds at least one of the listed permissions. */
export function canAny(
  principal: Principal,
  permissions: readonly string[],
  context: AuthorizationContext = {},
): boolean {
  return permissions.some((p) => can(principal, p, context));
}
