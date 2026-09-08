/**
 * TOOTHLOGY SESSIONS
 *
 * Creating, resolving and revoking authenticated sessions.
 *
 * DESIGN: OPAQUE TOKENS, NOT JWTs
 *
 * A session is a random 256-bit token stored as a SHA-256 hash, looked up on
 * every request. The obvious alternative — a signed JWT carrying the user's
 * roles — avoids that lookup, and is the wrong choice here:
 *
 * - **A JWT cannot be revoked.** Toothlogy must be able to sign a user out of a
 *   stolen device *now*, and must be able to kill every session of a suspended
 *   account immediately. With a stateless token the best you get is "when it
 *   expires", and shortening expiry to compensate just moves the problem to
 *   refresh tokens, which need server state anyway.
 * - **Roles change and must take effect immediately.** A dentist whose
 *   verification is revoked must lose access at once, not when their token
 *   expires. Embedded claims are a cache with no invalidation.
 * - **The lookup is one indexed query** on a unique column. That is not the
 *   bottleneck it is often assumed to be.
 *
 * WHY THE HASH
 * The same reasoning as passwords: if the database leaks, stored hashes are not
 * usable as sessions. SHA-256 rather than scrypt because the token is already
 * 256 bits of entropy — there is nothing to brute-force, so the slow hash buys
 * nothing and would add latency to every single request.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { newId } from '../kernel/ids';
import type { OrganizationMembership, Principal } from '../rbac';
import { ANONYMOUS } from '../rbac';
import { db } from '../db/client';

/** Cookie carrying the session token. */
export const SESSION_COOKIE = 'tl_session';

/**
 * 30 days. Long enough that patients are not signed out between dental visits,
 * which are months apart; short enough to bound the damage of an unnoticed
 * stolen token. Rolling refresh (below) means active users are never logged out
 * mid-use.
 */
export const SESSION_TTL_DAYS = 30;

/**
 * Refresh the expiry only when the session is more than a day old.
 *
 * Updating `expiresAt` on every request would mean a database write on every
 * authenticated request — turning a read-mostly path into a write-heavy one for
 * no benefit.
 */
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export interface SessionContext {
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}

/** Hash a session token for storage and lookup. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/**
 * Generate a session token.
 *
 * 32 bytes from a CSPRNG. Guessing one is not feasible, which is what allows
 * the token to be the entire credential.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface CreatedSession {
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

/**
 * Create a session.
 *
 * Returns the plaintext token exactly once — it is never retrievable again,
 * because only its hash is stored. The caller sets it as an HTTP-only cookie.
 */
export async function createSession(
  userId: string,
  context: SessionContext = {},
): Promise<CreatedSession> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000);
  const sessionId = newId('session');

  await db().session.create({
    data: {
      id: sessionId,
      userId,
      tokenHash: hashSessionToken(token),
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      expiresAt,
    },
  });

  return { token, sessionId, expiresAt };
}

/**
 * Resolve a token into a principal.
 *
 * Returns ANONYMOUS for every failure — expired, revoked, unknown token,
 * suspended or deleted user. The caller cannot distinguish these, and should
 * not: "this token is expired" versus "this token never existed" is a useful
 * distinction to an attacker probing stolen tokens and to nobody else.
 *
 * Loads global roles and per-organization memberships in the same query, so an
 * authorization decision never needs a second round trip.
 */
export async function resolveSession(token: string | null | undefined): Promise<Principal> {
  if (!token) return ANONYMOUS;

  const session = await db().session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          roleAssignments: true,
          organizationMemberships: { where: { leftAt: null } },
        },
      },
    },
  });

  if (!session) return ANONYMOUS;

  const now = new Date();
  if (session.revokedAt !== null || session.expiresAt <= now) return ANONYMOUS;

  const user = session.user;
  // A suspended or soft-deleted account must lose access immediately, not when
  // its session happens to expire. This check is the reason sessions are
  // server-side.
  if (user.status !== 'ACTIVE' || user.deletedAt !== null) return ANONYMOUS;

  // Global roles: assignments with no organization, and not expired.
  const globalRoles = user.roleAssignments
    .filter((a) => a.organizationId === null)
    .filter((a) => a.expiresAt === null || a.expiresAt > now)
    .map((a) => a.roleKey);

  // Organization-scoped roles, grouped by organization. Both the membership row
  // and any org-scoped RoleAssignment contribute.
  const byOrganization = new Map<string, Set<string>>();

  for (const membership of user.organizationMemberships) {
    const set = byOrganization.get(membership.organizationId) ?? new Set<string>();
    set.add(membership.roleKey);
    byOrganization.set(membership.organizationId, set);
  }

  for (const assignment of user.roleAssignments) {
    if (!assignment.organizationId) continue;
    if (assignment.expiresAt !== null && assignment.expiresAt <= now) continue;
    const set = byOrganization.get(assignment.organizationId) ?? new Set<string>();
    set.add(assignment.roleKey);
    byOrganization.set(assignment.organizationId, set);
  }

  const organizations: OrganizationMembership[] = [...byOrganization].map(
    ([organizationId, roles]) => ({ organizationId, roles: [...roles] }),
  );

  // Rolling expiry, written only when it has actually moved. Deliberately not
  // awaited: extending a session must never add latency to, or fail, the
  // request it is extending.
  const age = now.getTime() - session.lastActiveAt.getTime();
  if (age > REFRESH_AFTER_MS) {
    void db()
      .session.update({
        where: { id: session.id },
        data: {
          lastActiveAt: now,
          expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 3600 * 1000),
        },
      })
      .catch(() => {
        /* Best-effort. A failed refresh shortens the session; it breaks nothing. */
      });
  }

  return {
    kind: 'user',
    userId: user.id,
    sessionId: session.id,
    // Every authenticated principal holds the base `user` role, which is what
    // grants control over their own account (see src/registry/roles.ts).
    roles: globalRoles.includes('user') ? globalRoles : ['user', ...globalRoles],
    organizations,
  };
}

/** Revoke one session — sign out on this device. */
export async function revokeSession(sessionId: string): Promise<void> {
  await db().session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke every session for a user — "sign out everywhere".
 *
 * Called on password change, on suspension, and when a user reports a device
 * lost. Returns the count so the UI can confirm what happened.
 */
export async function revokeAllSessions(
  userId: string,
  options: { exceptSessionId?: string } = {},
): Promise<number> {
  const result = await db().session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export interface SessionSummary {
  readonly id: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly lastActiveAt: Date;
  readonly expiresAt: Date;
  readonly isCurrent: boolean;
}

/**
 * A user's active sessions, for the security settings page.
 *
 * This is how a user notices an account takeover: an unrecognised device or
 * location in the list. It only helps if they can then revoke it, which is why
 * it ships alongside `revokeSession`.
 */
export async function listSessions(
  userId: string,
  currentSessionId?: string,
): Promise<SessionSummary[]> {
  const sessions = await db().session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: 'desc' },
  });

  return sessions.map((s) => ({
    id: s.id,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    expiresAt: s.expiresAt,
    isCurrent: s.id === currentSessionId,
  }));
}

/** Delete expired and long-revoked sessions. For the maintenance job. */
export async function pruneSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const result = await db().session.deleteMany({
    where: {
      OR: [{ expiresAt: { lte: new Date() } }, { revokedAt: { lte: cutoff } }],
    },
  });
  return result.count;
}

/**
 * Constant-time comparison for tokens compared outside the database.
 *
 * Used by the invitation and verification-token flows, where a candidate is
 * compared against a stored hash in application code rather than by an indexed
 * lookup.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
