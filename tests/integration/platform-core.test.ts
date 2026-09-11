/**
 * TL-TEST-PLATFORM-CORE-001 — Phase 1 completion against a real database
 *
 * Outbox relay, durable handlers, honest notification delivery, MFA, HTTP
 * idempotency, security signals, restoration and erasure.
 *
 * The notification assertions are the P10 ones: with no provider configured,
 * email and SMS must be recorded as FAILED with NOT_CONFIGURED — never as sent
 * — while in-app, which needs no provider, genuinely delivers.
 */

import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  confirmPhoneVerification,
  login,
  register,
  requestAccountDeletion,
  requestPhoneVerification,
  restoreAccount,
  sendEmailVerification,
} from '@/platform/auth/service';
import {
  completeMfaChallenge,
  confirmTotpEnrollment,
  mfaStatus,
  startTotpEnrollment,
} from '@/platform/auth/mfa';
import { hotp, totpStep } from '@/platform/auth/totp';
import { hashOtpCode } from '@/platform/auth/otp';
import { derivedSecret } from '@/platform/security/crypto';
import { processDueErasures } from '@/platform/auth/erasure';
import { OUTBOX_MAX_ATTEMPTS, registerDurableHandler, relayOutbox } from '@/platform/events/outbox';
import { registerPlatformSubscribers, resetPlatformSubscribers } from '@/platform/events/subscribers';
import { notifyUser, processDueNotifications } from '@/platform/notifications';
import { SESSION_COOKIE } from '@/platform/auth/session';
import { PUT as putDentistProfile } from '@/app/api/v1/dentists/me/route';
import { POST as runJobsRoute } from '@/app/api/v1/internal/jobs/route';
import {
  assertSeeded,
  describeIntegration,
  disconnectTestDb,
  resetDatabase,
  testDb,
  useDatabaseAuditSink,
} from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const UA_A =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const UA_B =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function makeUser(email: string, role: 'patient' | 'dentist' = 'patient') {
  const result = await register({
    email,
    password: PASSWORD,
    displayName: 'Asha Test',
    role,
    acceptedTerms: true,
  });
  return result;
}

describeIntegration('platform core (integration)', () => {
  beforeAll(async () => {
    await assertSeeded();
    // CI provides no SESSION_SECRET; MFA and OTP need a key to derive from.
    process.env.SESSION_SECRET ??= randomBytes(48).toString('base64');
  });

  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    resetPlatformSubscribers();
    registerPlatformSubscribers();
  });

  afterAll(async () => {
    resetPlatformSubscribers();
    await disconnectTestDb();
  });

  // -------------------------------------------------------------------------
  // Outbox relay
  // -------------------------------------------------------------------------

  it('writes USER_CREATED with the user and relays it to the welcome handler once', async () => {
    const { userId } = await makeUser('asha@example.test');

    const pending = await testDb().outboxEvent.findMany({ where: { name: 'USER_CREATED' } });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.publishedAt).toBeNull();

    const first = await relayOutbox();
    expect(first).toMatchObject({ claimed: 1, published: 1, retried: 0, dead: 0 });

    const inApp = await testDb().inAppNotification.findMany({ where: { userId } });
    expect(inApp).toHaveLength(1);
    expect(inApp[0]!.title).toBe('Welcome to Toothlogy');
    expect(inApp[0]!.body).toContain('Asha Test');

    // Nothing left to claim, and running again changes nothing.
    expect((await relayOutbox()).claimed).toBe(0);
    expect(await testDb().inAppNotification.count({ where: { userId } })).toBe(1);
  });

  it('retries a failed handler without re-running the ones that succeeded', async () => {
    const { userId } = await makeUser('asha@example.test');

    let failNext = true;
    registerDurableHandler('USER_CREATED', 'test.flaky', async () => {
      if (failNext) {
        failNext = false;
        throw new Error('provider blip');
      }
    });

    const first = await relayOutbox();
    expect(first).toMatchObject({ retried: 1, published: 0 });

    const row = await testDb().outboxEvent.findFirstOrThrow({ where: { name: 'USER_CREATED' } });
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('test.flaky');
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    // Make it due now and relay again.
    await testDb().outboxEvent.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(0) } });
    const second = await relayOutbox();
    expect(second).toMatchObject({ published: 1 });

    // The welcome handler had a receipt from the first run: no duplicate.
    expect(await testDb().inAppNotification.count({ where: { userId } })).toBe(1);
    const receipts = await testDb().eventHandlerReceipt.findMany({ where: { eventId: row.id } });
    expect(receipts.map((r) => r.handler).sort()).toEqual(['notify.welcome', 'test.flaky']);
  });

  it('dead-letters an event after exhausting its retries', async () => {
    await makeUser('asha@example.test');
    registerDurableHandler('USER_CREATED', 'test.always-fails', async () => {
      throw new Error('permanently broken');
    });

    const row = await testDb().outboxEvent.findFirstOrThrow({ where: { name: 'USER_CREATED' } });
    await testDb().outboxEvent.update({
      where: { id: row.id },
      data: { attempts: OUTBOX_MAX_ATTEMPTS - 1 },
    });

    const result = await relayOutbox();
    expect(result.dead).toBe(1);
    const dead = await testDb().outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(dead.deadAt).not.toBeNull();
    expect(dead.publishedAt).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Honest notification delivery
  // -------------------------------------------------------------------------

  it('delivers in-app, records unconfigured email as FAILED, never as sent', async () => {
    const { userId } = await makeUser('asha@example.test');
    await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });

    const result = await notifyUser({
      userId,
      notificationId: 'TL-NOTIF-SECURITY-ALERT-001',
      data: { alert: 'A test alert', when: 'now', ipAddress: '203.0.113.5' },
    });

    const byChannel = Object.fromEntries(result.outcomes.map((o) => [o.channel, o]));
    expect(byChannel.in_app?.status).toBe('sent');
    expect(byChannel.email).toMatchObject({ status: 'failed', reason: 'NOT_CONFIGURED' });
    expect(byChannel.sms).toMatchObject({ status: 'skipped' }); // no phone

    const records = await testDb().notificationRecord.findMany({ where: { userId } });
    const email = records.find((r) => r.channel === 'EMAIL')!;
    const inApp = records.find((r) => r.channel === 'IN_APP')!;
    expect(inApp.status).toBe('DELIVERED');
    expect(email.status).toBe('FAILED');
    expect(email.lastError).toBe('NOT_CONFIGURED');
    expect(email.sentAt).toBeNull();
    expect(email.nextAttemptAt).not.toBeNull(); // scheduled for retry
  });

  it('does not send to an unverified email address', async () => {
    const { userId } = await makeUser('asha@example.test');
    const result = await notifyUser({
      userId,
      notificationId: 'TL-NOTIF-SECURITY-ALERT-001',
      data: { alert: 'x', when: 'y', ipAddress: 'z' },
    });
    expect(result.outcomes.find((o) => o.channel === 'email')).toMatchObject({
      status: 'skipped',
      reason: 'No email address on file',
    });
  });

  it('never stores a single-use link, and does not retry a message that carried one', async () => {
    const { userId } = await makeUser('asha@example.test');
    const outcome = await sendEmailVerification(userId);
    expect(outcome).toEqual({ sent: false, reason: 'NOT_CONFIGURED' });

    const record = await testDb().notificationRecord.findFirstOrThrow({
      where: { userId, notificationId: 'TL-NOTIF-EMAIL-VERIFY-001' },
    });
    const serialized = JSON.stringify(record.data);
    expect(serialized).not.toMatch(/token=|verifyUrl/);
    expect((record.data as Record<string, unknown>).__transient).toBe(true);
    expect(record.nextAttemptAt).toBeNull();

    // Even if forced due, the retry worker abandons it rather than send a link it does not have.
    await testDb().notificationRecord.update({ where: { id: record.id }, data: { nextAttemptAt: new Date(0) } });
    const processed = await processDueNotifications();
    expect(processed.abandoned).toBe(1);
  });

  it('holds a non-urgent SMS for quiet hours and records it as PENDING', async () => {
    const { userId } = await makeUser('asha@example.test');
    await testDb().user.update({
      where: { id: userId },
      data: { phone: '+919876543210', phoneVerifiedAt: new Date(), timezone: 'UTC' },
    });
    const minutesNow = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
    await testDb().userPreference.create({
      data: {
        id: 'upf_test',
        userId,
        quietHoursStart: (minutesNow + 1440 - 60) % 1440,
        quietHoursEnd: (minutesNow + 60) % 1440,
      },
    });

    const result = await notifyUser({
      userId,
      notificationId: 'TL-NOTIF-APPOINTMENT-REMINDER-001',
      data: { when: 'tomorrow 10:00', dentist: 'Dr A', location: 'Main' },
    });
    expect(result.outcomes.find((o) => o.channel === 'sms')?.status).toBe('deferred');
    expect(result.outcomes.find((o) => o.channel === 'in_app')?.status).toBe('sent');

    const sms = await testDb().notificationRecord.findFirstOrThrow({ where: { userId, channel: 'SMS' } });
    expect(sms.status).toBe('PENDING');
    expect(sms.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  // -------------------------------------------------------------------------
  // Two-step verification
  // -------------------------------------------------------------------------

  it('requires a second factor, rejects a replayed code, and accepts a recovery code once', async () => {
    const { userId } = await makeUser('asha@example.test');

    const setup = await startTotpEnrollment(userId, PASSWORD);
    const stored = await testDb().credential.findFirstOrThrow({ where: { userId, type: 'TOTP' } });
    expect(stored.encryptedSecret).not.toContain(setup.secret);

    const now = totpStep();
    const { recoveryCodes } = await confirmTotpEnrollment(userId, hotp(setup.secret, now));
    expect(recoveryCodes).toHaveLength(10);
    expect((await mfaStatus(userId)).enabled).toBe(true);

    // A password alone yields a challenge, not a session.
    const first = await login({ identifier: 'asha@example.test', password: PASSWORD });
    expect(first.kind).toBe('mfa_required');
    if (first.kind !== 'mfa_required') return;

    await expect(completeMfaChallenge(first.challengeToken, { code: '000000' })).rejects.toThrow(/not correct/);

    const nextCode = hotp(setup.secret, now + 1);
    const completed = await completeMfaChallenge(first.challengeToken, { code: nextCode });
    expect(completed.userId).toBe(userId);

    // The same code on a fresh challenge is a replay.
    const second = await login({ identifier: 'asha@example.test', password: PASSWORD });
    if (second.kind !== 'mfa_required') throw new Error('expected a challenge');
    await expect(completeMfaChallenge(second.challengeToken, { code: nextCode })).rejects.toThrow();

    // A recovery code works once.
    const third = await login({ identifier: 'asha@example.test', password: PASSWORD });
    if (third.kind !== 'mfa_required') throw new Error('expected a challenge');
    await completeMfaChallenge(third.challengeToken, { recoveryCode: recoveryCodes[0]! });

    const fourth = await login({ identifier: 'asha@example.test', password: PASSWORD });
    if (fourth.kind !== 'mfa_required') throw new Error('expected a challenge');
    await expect(completeMfaChallenge(fourth.challengeToken, { recoveryCode: recoveryCodes[0]! })).rejects.toThrow();

    // The recovery code's use was recorded and alerted.
    const events = await testDb().securityEvent.findMany({ where: { userId, type: 'RECOVERY_CODE_USED' } });
    expect(events).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // HTTP idempotency
  // -------------------------------------------------------------------------

  it('replays an idempotent PUT with the same key, and rejects the key reused with a new body', async () => {
    const { session } = await makeUser('dr@example.test', 'dentist');

    const call = (slug: string, key: string) =>
      putDentistProfile(
        new Request('http://localhost/api/v1/dentists/me', {
          method: 'PUT',
          headers: {
            cookie: `${SESSION_COOKIE}=${session.token}`,
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          body: JSON.stringify({ slug, languages: ['en'], specialtyKeys: [] }),
        }),
      );

    const first = await call('dr-idem', 'key-aaaaaaaa');
    expect(first.status).toBe(200);
    const firstBody = await first.json();

    const replay = await call('dr-idem', 'key-aaaaaaaa');
    expect(replay.status).toBe(200);
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    expect(await replay.json()).toEqual(firstBody);

    const misuse = await call('dr-other', 'key-aaaaaaaa');
    expect(misuse.status).toBe(409);
  });

  // -------------------------------------------------------------------------
  // Security signals
  // -------------------------------------------------------------------------

  it('alerts on a sign-in from an unfamiliar device and network, not on a familiar one', async () => {
    const { userId } = await makeUser('asha@example.test');

    await login({ identifier: 'asha@example.test', password: PASSWORD }, { userAgent: UA_A, ipAddress: '198.51.100.7' });
    await login({ identifier: 'asha@example.test', password: PASSWORD }, { userAgent: UA_A, ipAddress: '198.51.100.9' });
    expect(await testDb().securityEvent.count({ where: { userId, type: 'NEW_DEVICE_LOGIN' } })).toBe(0);

    await login({ identifier: 'asha@example.test', password: PASSWORD }, { userAgent: UA_B, ipAddress: '203.0.113.50' });
    expect(await testDb().securityEvent.count({ where: { userId, type: 'NEW_DEVICE_LOGIN' } })).toBe(1);

    // The alert was queued in the outbox with the event.
    expect(await testDb().outboxEvent.count({ where: { name: 'SECURITY_ALERT_RAISED' } })).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Deletion, restoration, erasure
  // -------------------------------------------------------------------------

  it('lets the owner restore an account during the grace period', async () => {
    const { userId } = await makeUser('asha@example.test');
    await requestAccountDeletion(userId, 'testing');

    await expect(login({ identifier: 'asha@example.test', password: PASSWORD })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    await expect(restoreAccount({ identifier: 'asha@example.test', password: 'wrong password!!' })).rejects.toThrow(
      /incorrect/,
    );

    const restored = await restoreAccount({ identifier: 'asha@example.test', password: PASSWORD });
    expect(restored.kind).toBe('session');

    const user = await testDb().user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.status).toBe('ACTIVE');
    const request = await testDb().accountDeletionRequest.findUniqueOrThrow({ where: { userId } });
    expect(request.status).toBe('CANCELLED');
  });

  it('erases personal data when the grace period ends, keeping an anonymous row', async () => {
    const { userId } = await makeUser('asha@example.test');
    await requestAccountDeletion(userId, undefined);
    await testDb().accountDeletionRequest.update({
      where: { userId },
      data: { scheduledFor: new Date(Date.now() - 1000) },
    });

    expect(await processDueErasures()).toEqual({ erased: 1, failed: 0 });

    const user = await testDb().user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBeNull();
    expect(user.displayName).toBe('Deleted user');
    expect(user.erasedAt).not.toBeNull();
    expect(await testDb().credential.count({ where: { userId } })).toBe(0);
    expect(await testDb().session.count({ where: { userId } })).toBe(0);
    // The audit trail survives erasure (Constitution §8).
    expect(await testDb().auditEvent.count({ where: { subject: userId, action: 'ACCOUNT_ERASED' } })).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Phone verification with SMS unconfigured
  // -------------------------------------------------------------------------

  it('reports SMS as not configured, stores only a keyed hash, and verifies a correct code', async () => {
    const { userId } = await makeUser('asha@example.test');

    const sent = await requestPhoneVerification(userId, '+919876543210');
    expect(sent).toMatchObject({ sent: false, reason: 'NOT_CONFIGURED' });

    const challenge = await testDb().credential.findFirstOrThrow({ where: { userId, type: 'OTP_PHONE' } });
    expect(challenge.secretHash).not.toMatch(/^\d{6}$/);

    await expect(confirmPhoneVerification(userId, '000000')).rejects.toThrow(/not correct|expired/);

    // Stand in for the handset: install a challenge whose code we know.
    await testDb().credential.update({
      where: { id: challenge.id },
      data: { secretHash: hashOtpCode('123456', '+919876543210', derivedSecret('otp-code')), attemptsRemaining: 5 },
    });
    const verified = await confirmPhoneVerification(userId, '123456');
    expect(verified.phone).toBe('+919876543210');

    const user = await testDb().user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.phone).toBe('+919876543210');
    expect(user.phoneVerifiedAt).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Job runner authorization
  // -------------------------------------------------------------------------

  it('runs jobs only for the scheduler secret or an authorized administrator', async () => {
    process.env.JOB_RUNNER_SECRET = 'j'.repeat(40);
    const post = (headers: Record<string, string>) =>
      runJobsRoute(
        new Request('http://localhost/api/v1/internal/jobs', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ jobs: ['outbox.relay'] }),
        }),
      );

    expect((await post({})).status).toBe(401);
    expect((await post({ authorization: `Bearer ${'x'.repeat(40)}` })).status).toBe(401);

    const ok = await post({ authorization: `Bearer ${'j'.repeat(40)}` });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.data.reports[0]).toMatchObject({ name: 'outbox.relay', ok: true });
    delete process.env.JOB_RUNNER_SECRET;
  });
});
