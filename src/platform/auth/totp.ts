/**
 * TOOTHLOGY TOTP (RFC 6238)
 *
 * Time-based one-time passwords for the authenticator-app second factor.
 *
 * Written against the RFC with `node:crypto` rather than pulled in as a
 * dependency: the algorithm is thirty lines, and an authentication dependency
 * is a supply-chain risk sitting directly in the login path.
 *
 * Parameters are the ones every authenticator app assumes — HMAC-SHA1, six
 * digits, a 30-second step. Deviating from them is technically allowed by the
 * RFC and practically breaks Google Authenticator, which ignores the hints.
 *
 * Verification accepts the previous and next step as well as the current one.
 * Phones drift, and a code typed in the last second of its window arrives in
 * the next; a window of one step either side is the conventional tolerance.
 * Replay inside that window is stopped by the caller persisting the accepted
 * step and refusing any step at or before it.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_DIGITS = 6;
export const TOTP_STEP_SECONDS = 30;
/** Steps accepted either side of now. */
export const TOTP_WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, unpadded — the form authenticator apps accept. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** A new 160-bit secret, the length RFC 4226 recommends for HMAC-SHA1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The time step for an instant. */
export function totpStep(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
}

/** HOTP (RFC 4226) for one counter value. */
export function hotp(secret: string, counter: number, digits: number = TOTP_DIGITS): string {
  const key = Buffer.from(base32Decode(secret));
  const message = Buffer.alloc(8);
  // Counter is a 64-bit big-endian integer. Steps fit in 53 bits for millennia.
  message.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totp(secret: string, now: Date = new Date()): string {
  return hotp(secret, totpStep(now));
}

/**
 * Verify a code and return the step it matched, or null.
 *
 * Steps at or before `lastUsedStep` are refused, which is the replay guard:
 * once a code has been accepted, neither it nor any earlier one in the window
 * works again. Comparison is constant-time per candidate so response timing
 * does not reveal which step was closest.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: { now?: Date; lastUsedStep?: number | null } = {},
): number | null {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;

  const current = totpStep(options.now);
  let matched: number | null = null;

  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const step = current + offset;
    if (options.lastUsedStep !== undefined && options.lastUsedStep !== null && step <= options.lastUsedStep) {
      continue;
    }
    const expected = Buffer.from(hotp(secret, step));
    const actual = Buffer.from(normalized);
    // Every candidate is compared, even after a match, so the loop's duration
    // does not depend on where the match fell.
    if (timingSafeEqual(expected, actual) && matched === null) matched = step;
  }

  return matched;
}

/**
 * The otpauth:// URI an authenticator app imports.
 *
 * The issuer appears both as a label prefix and a parameter: older apps read
 * the prefix, newer ones the parameter, and omitting either shows the account
 * as an unlabelled string of digits in some of them.
 */
export function otpauthUri(secret: string, accountLabel: string, issuer = 'Toothlogy'): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

export const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A batch of recovery codes, formatted `XXXXX-XXXXX`.
 *
 * Fifty bits each from an alphabet without look-alike characters (no 0/O, 1/I/L),
 * because these are copied onto paper and typed back months later under stress.
 */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(10);
    let raw = '';
    for (const byte of bytes) raw += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

/** Normalise a typed recovery code: case, spaces and the dash are forgiven. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}
