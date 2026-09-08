/**
 * TL-TEST-AUTH-001 — Password hashing and OTP
 *
 * These tests target the properties that make credential handling safe rather
 * than merely functional: unique salts, timing-safe comparison, single-use
 * codes, and attempt limits.
 */

import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  checkPasswordPolicy,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '@/platform/auth/password';
import {
  OTP_MAX_ATTEMPTS,
  canResendOtp,
  createOtpChallenge,
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
} from '@/platform/auth/otp';

const SECRET = 'test-otp-signing-secret-not-a-real-one';

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password entirely', hash)).toBe(false);
  });

  it('never stores the password in the encoded hash', async () => {
    const password = 'a-very-distinctive-password-value';
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
  });

  it('produces a different hash each time for the same password', async () => {
    // Unique salts. Without them, identical passwords produce identical hashes
    // and one rainbow table breaks every account that shares a password.
    const [a, b] = await Promise.all([hashPassword('same password'), hashPassword('same password')]);
    expect(a).not.toBe(b);
    expect(await verifyPassword('same password', a)).toBe(true);
    expect(await verifyPassword('same password', b)).toBe(true);
  });

  it('encodes its own parameters so cost can be raised later', async () => {
    const hash = await hashPassword('parameters travel with the hash');
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(hash.split('$')).toHaveLength(6);
  });

  it('flags a weaker legacy hash for rehash', () => {
    // Simulates a hash created under an older, cheaper parameter set.
    expect(needsRehash('scrypt$1024$8$1$c2FsdA==$aGFzaA==')).toBe(true);
  });

  it('does not flag a current-cost hash', async () => {
    expect(needsRehash(await hashPassword('current cost password'))).toBe(false);
  });

  it('returns false rather than throwing on a corrupted stored hash', async () => {
    // A damaged row must fail the login, not crash the endpoint.
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$abc$8$1$zz$zz')).toBe(false);
    expect(needsRehash('garbage')).toBe(true);
  });

  it('rejects a tampered hash with absurd parameters', async () => {
    // A huge N in a tampered row would let a crafted hash exhaust server
    // memory during verification.
    expect(await verifyPassword('x', 'scrypt$99999999$8$1$c2FsdA==$aGFzaA==')).toBe(false);
  });

  it('normalises Unicode so the same password works across platforms', async () => {
    // The same accented character has two encodings; without NFKC the password
    // would work on one operating system and fail on another.
    const composed = 'passwörd-composed';
    const decomposed = composed.normalize('NFD');
    expect(composed).not.toBe(decomposed);

    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });

  it('handles a long password without hanging', async () => {
    const long = 'x'.repeat(256);
    expect(await verifyPassword(long, await hashPassword(long))).toBe(true);
    await expect(hashPassword('x'.repeat(257))).rejects.toThrow(/maximum length/i);
  });
});

describe('password policy', () => {
  it('requires a minimum length', () => {
    expect(checkPasswordPolicy('short').valid).toBe(false);
    expect(checkPasswordPolicy('x'.repeat(MIN_PASSWORD_LENGTH)).valid).toBe(true);
  });

  it('rejects the passwords at the top of every breach corpus', () => {
    expect(checkPasswordPolicy('password123').valid).toBe(false);
    expect(checkPasswordPolicy('Password123').valid).toBe(false); // case-insensitive
    expect(checkPasswordPolicy('toothlogy').valid).toBe(false);
  });

  it('accepts a long passphrase without demanding symbols', () => {
    // Composition rules push people toward `Password1!`, which is predictable
    // and weaker than a long passphrase.
    expect(checkPasswordPolicy('the quiet dentist counts molars').valid).toBe(true);
  });

  it('explains why a password was rejected', () => {
    const result = checkPasswordPolicy('abc');
    expect(result.valid).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.problems[0]).toMatch(/at least/i);
  });
});

describe('OTP', () => {
  it('generates a numeric code of the expected length', () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('generates varied codes', () => {
    // A weak generator would repeat; Math.random() would also be predictable.
    const codes = new Set(Array.from({ length: 100 }, () => generateOtpCode()));
    expect(codes.size).toBeGreaterThan(50);
  });

  it('stores a hash, never the code', () => {
    const { challenge, code } = createOtpChallenge('+919876543210', SECRET);
    expect(challenge.codeHash).not.toContain(code);
  });

  it('binds the code to its destination', () => {
    // So a code issued for one recipient cannot be replayed against another.
    const code = '123456';
    expect(hashOtpCode(code, '+919876543210', SECRET)).not.toBe(
      hashOtpCode(code, '+919999999999', SECRET),
    );
  });

  it('accepts the correct code', () => {
    const { challenge, code } = createOtpChallenge('user@example.com', SECRET);
    const { result } = verifyOtpCode(challenge, code, 'user@example.com', SECRET);
    expect(result.ok).toBe(true);
  });

  it('rejects a wrong code and consumes an attempt', () => {
    const { challenge } = createOtpChallenge('user@example.com', SECRET);
    const { result, challenge: updated } = verifyOtpCode(
      challenge,
      '000000',
      'user@example.com',
      SECRET,
    );

    expect(result).toEqual({ ok: false, reason: 'mismatch' });
    expect(updated.attemptsRemaining).toBe(OTP_MAX_ATTEMPTS - 1);
  });

  it('exhausts after the attempt limit', () => {
    // A 6-digit code has a million possibilities — unlimited guessing breaks it
    // in minutes.
    let { challenge } = createOtpChallenge('user@example.com', SECRET);

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      challenge = verifyOtpCode(challenge, '000000', 'user@example.com', SECRET).challenge;
    }

    const { result } = verifyOtpCode(challenge, '000000', 'user@example.com', SECRET);
    expect(result).toEqual({ ok: false, reason: 'exhausted' });
  });

  it('cannot be replayed after a successful verification', () => {
    const { challenge, code } = createOtpChallenge('user@example.com', SECRET);
    const first = verifyOtpCode(challenge, code, 'user@example.com', SECRET);
    expect(first.result.ok).toBe(true);

    const replay = verifyOtpCode(first.challenge, code, 'user@example.com', SECRET);
    expect(replay.result).toEqual({ ok: false, reason: 'exhausted' });
  });

  it('rejects an expired code without consuming an attempt', () => {
    // A user who waited too long should not also lose their retries.
    const now = new Date('2026-01-01T00:00:00Z');
    const { challenge, code } = createOtpChallenge('user@example.com', SECRET, now);
    const later = new Date('2026-01-01T00:20:00Z');

    const { result, challenge: updated } = verifyOtpCode(
      challenge,
      code,
      'user@example.com',
      SECRET,
      later,
    );

    expect(result).toEqual({ ok: false, reason: 'expired' });
    expect(updated.attemptsRemaining).toBe(OTP_MAX_ATTEMPTS);
  });

  it('rejects a code verified against the wrong destination', () => {
    const { challenge, code } = createOtpChallenge('+919876543210', SECRET);
    const { result } = verifyOtpCode(challenge, code, '+919999999999', SECRET);
    expect(result.ok).toBe(false);
  });

  it('enforces a resend cooldown', () => {
    // Limits SMS-cost abuse from repeated resend taps.
    const sent = new Date('2026-01-01T00:00:00Z');
    expect(canResendOtp(sent, new Date('2026-01-01T00:00:30Z'))).toBe(false);
    expect(canResendOtp(sent, new Date('2026-01-01T00:01:30Z'))).toBe(true);
  });
});
