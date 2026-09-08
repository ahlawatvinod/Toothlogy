/**
 * TOOTHLOGY OTP (one-time codes)
 *
 * Phone and email verification, and the second factor for MFA.
 *
 * OTP is where authentication systems usually leak, so the rules here are
 * deliberate:
 *
 * - **Codes are stored hashed**, never in plaintext. A database read must not
 *   hand an attacker a working code, and support staff must not be able to read
 *   a customer's code out of a table.
 * - **Attempts are capped**, because a 6-digit code has only a million
 *   possibilities — unlimited guessing breaks it in minutes.
 * - **Verification is single-use and timing-safe**, so a correct code cannot be
 *   replayed and a near-miss cannot be detected by response time.
 * - **Codes expire**, because an SMS sits in a message history indefinitely.
 *
 * Delivery is not this module's concern: generating a code and sending it are
 * separate responsibilities, and sending goes through the notification ports
 * (`src/platform/notifications`). Until a provider is configured, sending fails
 * with NOT_CONFIGURED rather than pretending to have delivered (Constitution P10).
 */

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum gap between sends to the same destination, to limit SMS-cost abuse. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export interface OtpChallenge {
  /** HMAC of the code. The code itself is never stored. */
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly attemptsRemaining: number;
  readonly createdAt: Date;
}

export type OtpVerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'expired' | 'exhausted' | 'mismatch' };

/**
 * Generate a numeric code using a CSPRNG.
 *
 * `randomInt` is used rather than `Math.random()`, which is seeded predictably
 * and would make codes guessable from a handful of observations.
 */
export function generateOtpCode(length: number = OTP_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i += 1) code += randomInt(0, 10).toString();
  return code;
}

/**
 * Hash a code for storage, bound to its destination.
 *
 * The destination (phone or email) is part of the HMAC input, so a code issued
 * for one recipient cannot be replayed against another even if both hashes are
 * known. `secret` is the server-side signing key — without it, an attacker with
 * database read access could brute-force a 6-digit hash instantly.
 */
export function hashOtpCode(code: string, destination: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${destination.toLowerCase()}:${code}`)
    .digest('base64');
}

export function createOtpChallenge(
  destination: string,
  secret: string,
  now: Date = new Date(),
): { challenge: OtpChallenge; code: string } {
  const code = generateOtpCode();
  return {
    code,
    challenge: {
      codeHash: hashOtpCode(code, destination, secret),
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
      attemptsRemaining: OTP_MAX_ATTEMPTS,
      createdAt: now,
    },
  };
}

/**
 * Verify a submitted code.
 *
 * Expiry is checked before attempts so an expired challenge does not consume an
 * attempt — otherwise a user who waited too long would burn their retries on a
 * code that could never have worked.
 *
 * Returns the updated challenge alongside the result; the caller persists it.
 * Keeping persistence out of here makes the logic testable without a database
 * and keeps the attempt decrement in the same transaction as the caller's own
 * state change.
 */
export function verifyOtpCode(
  challenge: OtpChallenge,
  submittedCode: string,
  destination: string,
  secret: string,
  now: Date = new Date(),
): { result: OtpVerifyResult; challenge: OtpChallenge } {
  if (now >= challenge.expiresAt) {
    return { result: { ok: false, reason: 'expired' }, challenge };
  }
  if (challenge.attemptsRemaining <= 0) {
    return { result: { ok: false, reason: 'exhausted' }, challenge };
  }

  const expected = Buffer.from(challenge.codeHash, 'base64');
  const actual = Buffer.from(hashOtpCode(submittedCode, destination, secret), 'base64');

  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (matches) {
    // Single use: zero the attempts so the same code cannot be replayed.
    return { result: { ok: true }, challenge: { ...challenge, attemptsRemaining: 0 } };
  }

  return {
    result: { ok: false, reason: 'mismatch' },
    challenge: { ...challenge, attemptsRemaining: challenge.attemptsRemaining - 1 },
  };
}

/** Whether a new code may be sent yet, given the last send time. */
export function canResendOtp(lastSentAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - lastSentAt.getTime() >= OTP_RESEND_COOLDOWN_SECONDS * 1000;
}
