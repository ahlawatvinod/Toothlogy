/**
 * TOOTHLOGY MULTI-FACTOR AUTHENTICATION
 *
 * Authenticator-app (TOTP) second factor with single-use recovery codes.
 *
 *   setup (password) ──> unconfirmed secret ──confirm (code)──> enabled + 10 recovery codes
 *
 *   login: password ok ──> MFA challenge token (5 min) ──code / recovery code──> session
 *
 * Properties this module guarantees, each tested:
 *
 * - **A password alone never yields a session** for an MFA account. It yields
 *   a short-lived challenge, redeemable only with a second factor.
 * - **A TOTP code works once.** The accepted time step is persisted with a
 *   conditional update, so a code observed over a shoulder — or replayed by a
 *   second concurrent request — fails.
 * - **A mistyped code does not burn the challenge**, but five do: the attempt
 *   budget stops online guessing of a six-digit code within its five-minute life.
 * - **Recovery codes are single-use**, stored hashed, and their use alerts the
 *   account owner.
 * - **Turning MFA off needs the password AND a current factor**, so a stolen
 *   session cannot quietly strip the second factor.
 */

import { createHash } from 'node:crypto';
import { newId } from '../kernel/ids';
import { errors } from '../kernel/errors';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { open, seal } from '../security/crypto';
import { verifyPassword } from './password';
import { createSession, type CreatedSession } from './session';
import { hashToken, issueToken } from './tokens';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from './totp';
import { recordSecurityEvent, type SecurityContext } from './security-events';

/** Wrong codes allowed against one challenge before it is withdrawn. */
export const MFA_MAX_ATTEMPTS = 5;

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('base64url');
}

async function requirePassword(userId: string, password: string): Promise<void> {
  const credential = await db().credential.findFirst({ where: { userId, type: 'PASSWORD' } });
  if (!credential || !(await verifyPassword(password, credential.secretHash))) {
    throw errors.validation('Your password is incorrect.', { field: 'password' });
  }
}

async function confirmedTotp(userId: string) {
  return db().credential.findFirst({
    where: { userId, type: 'TOTP', confirmedAt: { not: null } },
  });
}

export async function hasMfa(userId: string): Promise<boolean> {
  return (await confirmedTotp(userId)) !== null;
}

export async function mfaStatus(userId: string) {
  const [totp, remaining] = await Promise.all([
    confirmedTotp(userId),
    db().recoveryCode.count({ where: { userId, usedAt: null } }),
  ]);
  return {
    enabled: totp !== null,
    enabledAt: totp?.confirmedAt ?? null,
    recoveryCodesRemaining: totp ? remaining : 0,
  };
}

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

/**
 * Begin enrolment. Re-running replaces any unconfirmed secret, so a user who
 * abandoned setup can simply start again; a confirmed factor must be turned
 * off explicitly first.
 */
export async function startTotpEnrollment(
  userId: string,
  password: string,
): Promise<{ secret: string; otpauthUri: string }> {
  await requirePassword(userId, password);

  if (await confirmedTotp(userId)) {
    throw errors.preconditionFailed('Two-step verification is already on. Turn it off before setting it up again.');
  }

  const user = await db().user.findUnique({ where: { id: userId }, select: { email: true, phone: true } });
  if (!user) throw errors.notFound('Account');

  const secret = generateTotpSecret();

  await transaction(async (tx) => {
    await tx.credential.deleteMany({ where: { userId, type: 'TOTP', confirmedAt: null } });
    await tx.credential.create({
      data: {
        id: newId('credential'),
        userId,
        type: 'TOTP',
        // The column is named for hashes; for TOTP it holds a marker, and the
        // real (encrypted) secret lives in `encryptedSecret`. Never the plaintext.
        secretHash: 'totp',
        encryptedSecret: seal(secret, 'totp-secret'),
      },
    });
  });

  return { secret, otpauthUri: otpauthUri(secret, user.email ?? user.phone ?? userId) };
}

/** Confirm enrolment with a working code; returns the recovery codes, once. */
export async function confirmTotpEnrollment(
  userId: string,
  code: string,
  context: SecurityContext = {},
): Promise<{ recoveryCodes: string[] }> {
  const pending = await db().credential.findFirst({
    where: { userId, type: 'TOTP', confirmedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending?.encryptedSecret) {
    throw errors.preconditionFailed('Start two-step verification setup first.');
  }

  const step = verifyTotp(open(pending.encryptedSecret, 'totp-secret'), code);
  if (step === null) {
    throw errors.validation('That code is not correct. Check the time on your phone and try again.', {
      field: 'code',
    });
  }

  const recoveryCodes = generateRecoveryCodes();

  await transaction(async (tx) => {
    await tx.credential.update({
      where: { id: pending.id },
      data: { confirmedAt: new Date(), lastUsedStep: step, lastUsedAt: new Date() },
    });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.recoveryCode.createMany({
      data: recoveryCodes.map((c) => ({
        id: newId('recoveryCode'),
        userId,
        codeHash: hashRecoveryCode(c),
      })),
    });
  });

  await recordSecurityEvent(userId, 'MFA_ENABLED', context);
  await recordAuditEvent({
    action: 'MFA_ENABLED',
    actor: userId,
    subject: userId,
    outcome: 'success',
    requestId: context.requestId,
  });

  return { recoveryCodes };
}

/** Turn MFA off. Needs the password and a current code or recovery code. */
export async function disableTotp(
  userId: string,
  password: string,
  factor: { code?: string; recoveryCode?: string },
  context: SecurityContext = {},
): Promise<void> {
  await requirePassword(userId, password);
  const totp = await confirmedTotp(userId);
  if (!totp) throw errors.preconditionFailed('Two-step verification is not on.');

  const ok = await verifySecondFactor(userId, factor, context);
  if (!ok) throw errors.validation('That code is not correct.', { field: 'code' });

  await transaction(async (tx) => {
    await tx.credential.deleteMany({ where: { userId, type: 'TOTP' } });
    await tx.recoveryCode.deleteMany({ where: { userId } });
  });

  await recordSecurityEvent(userId, 'MFA_DISABLED', context);
  await recordAuditEvent({
    action: 'MFA_DISABLED',
    actor: userId,
    subject: userId,
    outcome: 'success',
    requestId: context.requestId,
  });
}

export async function regenerateRecoveryCodes(
  userId: string,
  password: string,
  context: SecurityContext = {},
): Promise<{ recoveryCodes: string[] }> {
  await requirePassword(userId, password);
  if (!(await confirmedTotp(userId))) throw errors.preconditionFailed('Two-step verification is not on.');

  const recoveryCodes = generateRecoveryCodes();
  await transaction(async (tx) => {
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.recoveryCode.createMany({
      data: recoveryCodes.map((c) => ({
        id: newId('recoveryCode'),
        userId,
        codeHash: hashRecoveryCode(c),
      })),
    });
  });

  await recordSecurityEvent(userId, 'RECOVERY_CODES_REGENERATED', context);
  return { recoveryCodes };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Check a TOTP code or a recovery code, consuming what it uses.
 *
 * The TOTP step is recorded with a conditional update — `lastUsedStep` must be
 * lower than the new one — so two concurrent requests with the same valid
 * code cannot both succeed.
 */
async function verifySecondFactor(
  userId: string,
  factor: { code?: string; recoveryCode?: string },
  context: SecurityContext,
): Promise<boolean> {
  if (factor.recoveryCode) {
    const result = await db().recoveryCode.updateMany({
      where: { userId, codeHash: hashRecoveryCode(factor.recoveryCode), usedAt: null },
      data: { usedAt: new Date() },
    });
    if (result.count !== 1) return false;
    const remaining = await db().recoveryCode.count({ where: { userId, usedAt: null } });
    await recordSecurityEvent(userId, 'RECOVERY_CODE_USED', context, { remaining });
    return true;
  }

  if (!factor.code) return false;
  const totp = await confirmedTotp(userId);
  if (!totp?.encryptedSecret) return false;

  const step = verifyTotp(open(totp.encryptedSecret, 'totp-secret'), factor.code, {
    lastUsedStep: totp.lastUsedStep,
  });
  if (step === null) return false;

  const claimed = await db().credential.updateMany({
    where: {
      id: totp.id,
      OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
    },
    data: { lastUsedStep: step, lastUsedAt: new Date() },
  });
  return claimed.count === 1;
}

// ---------------------------------------------------------------------------
// Login challenge
// ---------------------------------------------------------------------------

export async function issueMfaChallenge(
  userId: string,
  context: SecurityContext = {},
): Promise<{ challengeToken: string; expiresAt: Date }> {
  const issued = await issueToken(userId, 'MFA_CHALLENGE', 'mfa', { ipAddress: context.ipAddress });
  return { challengeToken: issued.token, expiresAt: issued.expiresAt };
}

/**
 * Redeem a challenge with a second factor for a session.
 *
 * The challenge is consumed only on success (or when its attempt budget is
 * spent), with a conditional update, so exactly one session can ever come out
 * of one challenge.
 */
export async function completeMfaChallenge(
  challengeToken: string,
  factor: { code?: string; recoveryCode?: string },
  context: SecurityContext = {},
): Promise<{ userId: string; session: CreatedSession }> {
  const tokenHash = hashToken(challengeToken);
  const challenge = await db().verificationToken.findUnique({ where: { tokenHash } });

  const invalid = () =>
    errors.validation('This sign-in has expired. Enter your password again.', { field: 'challenge' });

  if (!challenge || challenge.type !== 'MFA_CHALLENGE' || challenge.consumedAt || challenge.expiresAt <= new Date()) {
    throw invalid();
  }

  const failures = await db().loginAttempt.count({
    where: { userId: challenge.userId, success: false, reason: 'mfa_bad_code', occurredAt: { gte: challenge.createdAt } },
  });
  if (failures >= MFA_MAX_ATTEMPTS) {
    await db().verificationToken.updateMany({ where: { tokenHash, consumedAt: null }, data: { consumedAt: new Date() } });
    throw invalid();
  }

  const ok = await verifySecondFactor(challenge.userId, factor, context);

  if (!ok) {
    await db().loginAttempt.create({
      data: {
        id: newId('request'),
        identifier: `mfa:${challenge.userId}`,
        userId: challenge.userId,
        success: false,
        reason: 'mfa_bad_code',
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    const left = MFA_MAX_ATTEMPTS - failures - 1;
    throw errors.validation(
      left > 0
        ? `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'That code is not correct. Enter your password again to get a new sign-in.',
      { field: 'code' },
    );
  }

  const consumed = await db().verificationToken.updateMany({
    where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw invalid();

  const session = await createSession(challenge.userId, context);

  await recordAuditEvent({
    action: 'USER_LOGIN_MFA',
    actor: challenge.userId,
    subject: challenge.userId,
    outcome: 'success',
    requestId: context.requestId,
    ipAddress: context.ipAddress ?? undefined,
    detail: { factor: factor.recoveryCode ? 'recovery_code' : 'totp' },
  });

  return { userId: challenge.userId, session };
}
