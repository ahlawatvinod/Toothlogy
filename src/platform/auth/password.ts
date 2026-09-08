/**
 * TOOTHLOGY PASSWORD HASHING
 *
 * Constitution §9: passwords are hashed with a memory-hard algorithm, never
 * logged, never returned, never reversible.
 *
 * **Algorithm: scrypt**, from Node's own `crypto` module.
 *
 * Argon2id is the current first choice in the abstract, but every Node binding
 * for it is a native addon — which means a compiler toolchain in CI, in Docker,
 * and on every developer machine including Windows. scrypt is memory-hard, is
 * in the standard library, needs no build step, and is explicitly recommended by
 * OWASP for password storage. A well-parameterised scrypt that is actually
 * deployed everywhere beats an Argon2id that breaks the Windows install.
 *
 * The encoded hash carries its own parameters:
 *
 *     scrypt$16384$8$1$<salt-b64>$<hash-b64>
 *            └─N─┘ │ │
 *                  │ └── parallelisation
 *                  └──── block size
 *
 * Parameters travel with the hash so they can be raised later without
 * invalidating existing passwords: `needsRehash()` identifies hashes below the
 * current cost, and they are upgraded transparently at next successful login.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * OWASP's recommended scrypt baseline (N=2^14, r=8, p=1) — roughly 16 MB of
 * memory per hash. High enough to make large-scale GPU cracking expensive,
 * low enough that a login does not become a denial-of-service vector against
 * our own servers.
 */
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** scrypt needs roughly 128·N·r bytes; this leaves generous headroom. */
const MAX_MEM = 64 * 1024 * 1024;

const ALGORITHM = 'scrypt';

/** Minimum length. Length dominates composition rules for real-world strength. */
export const MIN_PASSWORD_LENGTH = 10;
/**
 * Upper bound. Not a strength limit — a guard against a multi-megabyte password
 * being submitted to make the server spend CPU deliberately.
 */
export const MAX_PASSWORD_LENGTH = 256;

export interface PasswordPolicyResult {
  readonly valid: boolean;
  readonly problems: readonly string[];
}

/**
 * Validate a password against policy.
 *
 * Deliberately does not demand a symbol, a digit and mixed case. Those rules
 * push people toward `Password1!` — predictable, and weaker than a long
 * passphrase. Length plus a check against the obvious choices does more.
 */
export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const problems: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    problems.push(`Must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  if (/^\s+$/.test(password)) {
    problems.push('Cannot be only whitespace.');
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    problems.push('This password is too common. Choose something less predictable.');
  }

  return { valid: problems.length === 0, problems };
}

/**
 * A small deny-list of the passwords that appear at the top of every breach
 * corpus. A full corpus check belongs behind a service (a k-anonymity range
 * query against a breach API) in Phase 1; this catches the worst offenders with
 * no network dependency.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'iloveyou',
  'admin123',
  'welcome123',
  'letmein123',
  'toothlogy',
  'dentist123',
]);

/** Hash a password. Returns the self-describing encoded form. */
export async function hashPassword(password: string): Promise<string> {
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('Password exceeds maximum length.');
  }

  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(normalize(password), salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });

  return [
    ALGORITHM,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verify a password against an encoded hash.
 *
 * Comparison is timing-safe: a byte-by-byte `===` returns faster on an early
 * mismatch, and that timing difference is measurable enough to recover a hash
 * remotely. Returns false rather than throwing on a malformed stored hash — a
 * corrupted row must fail the login, not crash the endpoint.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parsed = parseEncoded(encoded);
  if (!parsed) return false;

  try {
    const derived = await scrypt(normalize(password), parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: MAX_MEM,
    });
    if (derived.length !== parsed.hash.length) return false;
    return timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}

/** True when a stored hash was made with weaker parameters than current policy. */
export function needsRehash(encoded: string): boolean {
  const parsed = parseEncoded(encoded);
  if (!parsed) return true;
  return parsed.N < PARAMS.N || parsed.r < PARAMS.r || parsed.p < PARAMS.p;
}

/**
 * Unicode-normalise before hashing.
 *
 * The same accented character can be encoded two ways. Without normalisation, a
 * password typed on a Mac and the same password typed on Windows can produce
 * different bytes — and a login that fails only on one platform is close to
 * impossible to diagnose from a bug report.
 */
function normalize(password: string): string {
  return password.normalize('NFKC');
}

interface ParsedHash {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

function parseEncoded(encoded: string): ParsedHash | null {
  const parts = encoded.split('$');
  if (parts.length !== 6) return null;
  const [algorithm, n, r, p, saltB64, hashB64] = parts;
  if (algorithm !== ALGORITHM) return null;

  const N = Number(n);
  const rr = Number(r);
  const pp = Number(p);
  if (!Number.isInteger(N) || !Number.isInteger(rr) || !Number.isInteger(pp)) return null;
  // Reject absurd parameters from a tampered row: a huge N would let a crafted
  // hash exhaust server memory during verification.
  if (N < 1024 || N > 1_048_576 || rr < 1 || rr > 32 || pp < 1 || pp > 16) return null;

  try {
    return {
      N,
      r: rr,
      p: pp,
      salt: Buffer.from(saltB64!, 'base64'),
      hash: Buffer.from(hashB64!, 'base64'),
    };
  } catch {
    return null;
  }
}
