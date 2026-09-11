/**
 * TL-TEST-AUTH-INTEGRATION-001 — Authentication against a real database
 *
 * These tests exercise the real service layer against real PostgreSQL. They
 * target the properties that only a real database can prove: unique
 * constraints, transaction atomicity, atomic single-use token consumption, and
 * the session lifecycle.
 *
 * The security properties asserted here are the ones that would be quietly lost
 * in a refactor and never noticed until they were exploited.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  cancelAccountDeletion,
  changePassword,
  completePasswordReset,
  login,
  register,
  requestAccountDeletion,
  requestPasswordReset,
  verifyContact,
} from '@/platform/auth/service';
import {
  createSession,
  listSessions,
  resolveSession,
  revokeAllSessions,
  revokeSession,
} from '@/platform/auth/session';
import { issueToken, redeemToken } from '@/platform/auth/tokens';
import { isAuthenticated } from '@/platform/rbac';
import {
  assertSeeded,
  describeIntegration,
  disconnectTestDb,
  resetDatabase,
  testDb,
  useDatabaseAuditSink,
} from '../helpers/database';

const VALID_PASSWORD = 'a sufficiently long passphrase';

function registration(overrides: Record<string, unknown> = {}) {
  return {
    email: 'patient@example.test',
    password: VALID_PASSWORD,
    displayName: 'Test Patient',
    role: 'patient' as const,
    acceptedTerms: true as const,
    ...overrides,
  };
}

describeIntegration('authentication (integration)', () => {
  beforeAll(async () => {
    await assertSeeded();
  });

  beforeEach(async () => {
    await resetDatabase();
    // The global setup resets the audit sink after every test, so it has to be
    // reinstalled here for the tests that assert on audit rows.
    useDatabaseAuditSink();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  it('creates the user, credential, role, profile and preferences atomically', async () => {
    const result = await register(registration());

    const user = await testDb().user.findUnique({
      where: { id: result.userId },
      include: {
        credentials: true,
        roleAssignments: true,
        profiles: true,
        notificationPreferences: true,
      },
    });

    // All five in one transaction. Four of five succeeding would produce an
    // account that can never log in, with nothing in the logs to say why.
    expect(user).not.toBeNull();
    expect(user!.credentials).toHaveLength(1);
    expect(user!.roleAssignments.map((r) => r.roleKey)).toEqual(['patient']);
    expect(user!.profiles.map((p) => p.type)).toEqual(['PATIENT']);
    expect(user!.notificationPreferences.length).toBeGreaterThan(0);
  });

  it('never stores the password in recoverable form', async () => {
    const result = await register(registration());
    const credential = await testDb().credential.findFirst({
      where: { userId: result.userId, type: 'PASSWORD' },
    });

    expect(credential!.secretHash).not.toContain(VALID_PASSWORD);
    expect(credential!.secretHash.startsWith('scrypt$')).toBe(true);
  });

  it('writes the USER_CREATED outbox event in the same transaction', async () => {
    const result = await register(registration());

    // The outbox guarantee: an event exists only if the state change committed.
    const events = await testDb().outboxEvent.findMany({ where: { name: 'USER_CREATED' } });
    expect(events).toHaveLength(1);
    expect((events[0]!.payload as { userId: string }).userId).toBe(result.userId);
    expect(events[0]!.publishedAt).toBeNull();
  });

  it('rejects a duplicate email without revealing that it is taken', async () => {
    await register(registration());

    // The message must not confirm the address is registered — that would make
    // registration a membership oracle.
    await expect(register(registration({ displayName: 'Someone Else' }))).rejects.toThrow(
      /cannot be used/i,
    );

    expect(await testDb().user.count()).toBe(1);
  });

  it('leaves no partial row behind when registration conflicts', async () => {
    await register(registration());
    await expect(register(registration())).rejects.toThrow();

    // The transaction rolled back: no orphan credential, profile or role.
    expect(await testDb().credential.count()).toBe(1);
    expect(await testDb().profile.count()).toBe(1);
    expect(await testDb().roleAssignment.count()).toBe(1);
  });

  it('refuses a password that fails policy', async () => {
    await expect(register(registration({ password: 'short' }))).rejects.toThrow(
      /cannot be used/i,
    );
    await expect(register(registration({ password: 'password123' }))).rejects.toThrow(
      /cannot be used/i,
    );
    expect(await testDb().user.count()).toBe(0);
  });

  it('refuses a privileged role at signup', async () => {
    // The escalation this prevents: `role: "platform_admin"` in a signup body.
    await expect(
      register(registration({ role: 'platform_admin' as never })),
    ).rejects.toThrow();
    expect(await testDb().user.count()).toBe(0);
  });

  it('accepts phone-only registration', async () => {
    // Requiring email would exclude the phone-first Indian market.
    const result = await register(
      registration({ email: undefined, phone: '+919876543210' }),
    );
    const user = await testDb().user.findUnique({ where: { id: result.userId } });
    expect(user!.phone).toBe('+919876543210');
    expect(user!.email).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  it('signs in with a correct password and issues a working session', async () => {
    await register(registration());
    const result = await login({
      identifier: 'patient@example.test',
      password: VALID_PASSWORD,
    });

    // An account without two-step verification gets a session directly.
    if (result.kind !== 'session') throw new Error('expected a session, not an MFA challenge');
    const principal = await resolveSession(result.session.token);
    expect(isAuthenticated(principal)).toBe(true);
    if (isAuthenticated(principal)) {
      expect(principal.userId).toBe(result.userId);
      // The base `user` role is always present, which is what grants control
      // over one's own account.
      expect(principal.roles).toContain('user');
      expect(principal.roles).toContain('patient');
    }
  });

  it('returns an identical error for a wrong password and an unknown account', async () => {
    await register(registration());

    const wrongPassword = await login({
      identifier: 'patient@example.test',
      password: 'definitely not the password',
    }).catch((e: Error) => e.message);

    const unknownAccount = await login({
      identifier: 'nobody@example.test',
      password: 'definitely not the password',
    }).catch((e: Error) => e.message);

    // Identical messages. Any difference is an account-enumeration oracle.
    expect(wrongPassword).toBe(unknownAccount);

    // And the same status: 401 UNAUTHENTICATED, not a validation error.
    const codes = await Promise.all(
      ['patient@example.test', 'nobody@example.test'].map((identifier) =>
        login({ identifier, password: 'definitely not the password' }).catch((e: { code?: string }) => e.code),
      ),
    );
    expect(codes).toEqual(['UNAUTHENTICATED', 'UNAUTHENTICATED']);
  });

  it('records both successful and failed attempts', async () => {
    await register(registration());
    await login({ identifier: 'patient@example.test', password: VALID_PASSWORD });
    await login({ identifier: 'patient@example.test', password: 'wrong' }).catch(() => {});

    const attempts = await testDb().loginAttempt.findMany();
    // The ratio of failures to successes is the credential-stuffing signal;
    // recording only failures loses it.
    expect(attempts.filter((a) => a.success)).toHaveLength(1);
    expect(attempts.filter((a) => !a.success)).toHaveLength(1);
  });

  it('locks out after repeated failures for one identifier', async () => {
    await register(registration());

    for (let i = 0; i < 10; i += 1) {
      await login({ identifier: 'patient@example.test', password: 'wrong' }).catch(() => {});
    }

    // Even the correct password is refused while locked out.
    await expect(
      login({ identifier: 'patient@example.test', password: VALID_PASSWORD }),
    ).rejects.toThrow(/too many requests/i);
  });

  it('refuses a suspended account that has the right password', async () => {
    const result = await register(registration());
    await testDb().user.update({
      where: { id: result.userId },
      data: { status: 'SUSPENDED' },
    });

    await expect(
      login({ identifier: 'patient@example.test', password: VALID_PASSWORD }),
    ).rejects.toThrow(/permission/i);
  });

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  it('resolves anonymous for an unknown, revoked or expired token', async () => {
    const result = await register(registration());

    expect((await resolveSession('not-a-real-token')).kind).toBe('anonymous');
    expect((await resolveSession(null)).kind).toBe('anonymous');

    const session = await createSession(result.userId);
    await revokeSession(session.sessionId);
    expect((await resolveSession(session.token)).kind).toBe('anonymous');

    const expired = await createSession(result.userId);
    await testDb().session.update({
      where: { id: expired.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await resolveSession(expired.token)).kind).toBe('anonymous');
  });

  it('drops access immediately when the account is suspended', async () => {
    // The property that justifies server-side sessions over stateless JWTs:
    // a stateless token would stay valid until it expired.
    const result = await register(registration());
    const session = await createSession(result.userId);

    expect((await resolveSession(session.token)).kind).toBe('user');

    await testDb().user.update({
      where: { id: result.userId },
      data: { status: 'SUSPENDED' },
    });

    expect((await resolveSession(session.token)).kind).toBe('anonymous');
  });

  it('stores only a hash of the session token', async () => {
    const result = await register(registration());
    const session = await createSession(result.userId);

    const row = await testDb().session.findUnique({ where: { id: session.sessionId } });
    expect(row!.tokenHash).not.toBe(session.token);
    expect(row!.tokenHash).not.toContain(session.token);
  });

  it('revokes all sessions except an excluded one', async () => {
    // register() signs the user in, so it creates a session of its own. Adding
    // three more gives four in total, and revoking all-but-one revokes three.
    const result = await register(registration());
    const keep = await createSession(result.userId);
    await createSession(result.userId);
    await createSession(result.userId);

    expect(await listSessions(result.userId)).toHaveLength(4);

    const revoked = await revokeAllSessions(result.userId, { exceptSessionId: keep.sessionId });

    expect(revoked).toBe(3);
    expect((await resolveSession(keep.token)).kind).toBe('user');
    expect(await listSessions(result.userId)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Tokens
  // -------------------------------------------------------------------------

  it('consumes a token exactly once', async () => {
    const result = await register(registration());
    const issued = await issueToken(result.userId, 'PASSWORD_RESET', 'patient@example.test');

    expect((await redeemToken(issued.token, 'PASSWORD_RESET')).ok).toBe(true);

    const second = await redeemToken(issued.token, 'PASSWORD_RESET');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('already_used');
  });

  it('consumes a token exactly once under concurrency', async () => {
    // The race a SELECT-then-UPDATE would lose: two parties setting a password
    // on the same account from one reset link.
    const result = await register(registration());
    const issued = await issueToken(result.userId, 'PASSWORD_RESET', 'patient@example.test');

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => redeemToken(issued.token, 'PASSWORD_RESET')),
    );

    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
  });

  it('invalidates a previous token of the same type when a new one is issued', async () => {
    const result = await register(registration());
    const first = await issueToken(result.userId, 'PASSWORD_RESET', 'patient@example.test');
    await issueToken(result.userId, 'PASSWORD_RESET', 'patient@example.test');

    // Otherwise every reset ever requested stays live until expiry.
    expect((await redeemToken(first.token, 'PASSWORD_RESET')).ok).toBe(false);
  });

  it('rejects a token redeemed as the wrong type', async () => {
    const result = await register(registration());
    const issued = await issueToken(result.userId, 'EMAIL_VERIFICATION', 'patient@example.test');

    const redeemed = await redeemToken(issued.token, 'PASSWORD_RESET');
    expect(redeemed.ok).toBe(false);
  });

  it('rejects an expired token', async () => {
    const result = await register(registration());
    const issued = await issueToken(result.userId, 'PASSWORD_RESET', 'patient@example.test');

    await testDb().verificationToken.updateMany({
      where: { userId: result.userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const redeemed = await redeemToken(issued.token, 'PASSWORD_RESET');
    expect(redeemed.ok).toBe(false);
    if (!redeemed.ok) expect(redeemed.reason).toBe('expired');
  });

  // -------------------------------------------------------------------------
  // Verification
  // -------------------------------------------------------------------------

  it('marks an email verified from its token', async () => {
    const result = await register(registration());
    expect(result.verificationToken).not.toBeNull();

    await verifyContact(result.verificationToken!, 'EMAIL_VERIFICATION');

    const user = await testDb().user.findUnique({ where: { id: result.userId } });
    expect(user!.emailVerifiedAt).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Password reset
  // -------------------------------------------------------------------------

  it('returns nulls for an unknown address rather than throwing', async () => {
    // The route responds identically either way; a thrown error would leak.
    const result = await requestPasswordReset('nobody@example.test');
    expect(result.token).toBeNull();
    expect(result.userId).toBeNull();
  });

  it('resets the password and revokes every session', async () => {
    const created = await register(registration());
    await createSession(created.userId);
    await createSession(created.userId);

    const request = await requestPasswordReset('patient@example.test');
    expect(request.token).not.toBeNull();

    const result = await completePasswordReset(request.token!, 'an entirely new passphrase');

    // Reset is the flow a compromised user goes through: leaving the
    // attacker's session alive would defeat it.
    expect(result.sessionsRevoked).toBeGreaterThanOrEqual(2);
    expect(await listSessions(created.userId)).toHaveLength(0);

    await expect(
      login({ identifier: 'patient@example.test', password: VALID_PASSWORD }),
    ).rejects.toThrow();

    const after = await login({
      identifier: 'patient@example.test',
      password: 'an entirely new passphrase',
    });
    expect(after.userId).toBe(created.userId);
  });

  it('requires the current password to change it', async () => {
    const created = await register(registration());

    // Without this check, an unattended logged-in device is a permanent
    // account takeover.
    await expect(
      changePassword(created.userId, 'wrong current', 'a fresh new passphrase'),
    ).rejects.toThrow(/current password is incorrect/i);
  });

  it('keeps the current session when changing password', async () => {
    const created = await register(registration());
    const keep = await createSession(created.userId);
    await createSession(created.userId);

    await changePassword(created.userId, VALID_PASSWORD, 'a fresh new passphrase', {
      keepSessionId: keep.sessionId,
    });

    // The user is not ejected from the page they just used.
    expect((await resolveSession(keep.token)).kind).toBe('user');
    expect(await listSessions(created.userId)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Account deletion
  // -------------------------------------------------------------------------

  it('schedules deletion, deactivates and revokes sessions, and can be cancelled', async () => {
    const created = await register(registration());
    await createSession(created.userId);

    const request = await requestAccountDeletion(created.userId, 'No longer needed');
    expect(request.scheduledFor.getTime()).toBeGreaterThan(Date.now());

    let user = await testDb().user.findUnique({ where: { id: created.userId } });
    expect(user!.status).toBe('DEACTIVATED');
    expect(await listSessions(created.userId)).toHaveLength(0);

    await cancelAccountDeletion(created.userId);

    user = await testDb().user.findUnique({ where: { id: created.userId } });
    expect(user!.status).toBe('ACTIVE');
  });

  it('preserves audit history across account deactivation', async () => {
    // Constitution §8: no division may delete from the audit log, including
    // when the account it describes goes away.
    const created = await register(registration());
    await requestAccountDeletion(created.userId, undefined);

    const events = await testDb().auditEvent.findMany({ where: { actor: created.userId } });
    expect(events.length).toBeGreaterThan(0);
  });
});
