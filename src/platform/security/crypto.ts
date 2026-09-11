/**
 * TOOTHLOGY APPLICATION CRYPTOGRAPHY
 *
 * Two primitives the platform needs and must not improvise per feature:
 *
 * 1. **A secret box** — authenticated encryption for values that must be
 *    recoverable (a TOTP shared secret) and therefore cannot be hashed.
 * 2. **Signatures** — HMAC over a payload, for stateless tokens such as signed
 *    file URLs and unsubscribe links that must be unforgeable but need no row.
 *
 * Keys are derived from `SESSION_SECRET` with HKDF and a distinct label per
 * purpose. One master secret to provision, and a compromise of one derived key
 * (say, a leaked signed-URL key in a log) says nothing about the others.
 *
 * With no `SESSION_SECRET` configured these throw NOT_CONFIGURED. There is no
 * development fallback key: a hard-coded key is a real key that happens to be
 * public, and it would end up protecting real data the day someone forgets to
 * set the variable.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { errors } from '../kernel/errors';

export type KeyPurpose =
  | 'totp-secret'
  | 'otp-code'
  | 'signed-file-url'
  | 'unsubscribe'
  | 'device-token'
  | 'job-runner'
  | 'analytics-actor';

function masterSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw errors.notConfigured('encryption key (SESSION_SECRET)');
  return secret;
}

function deriveKey(purpose: KeyPurpose): Buffer {
  return Buffer.from(hkdfSync('sha256', masterSecret(), 'toothlogy', `toothlogy:${purpose}`, 32));
}

/** A derived key as a string, for APIs that take a secret rather than a Buffer. */
export function derivedSecret(purpose: KeyPurpose): string {
  return deriveKey(purpose).toString('base64');
}

/** Whether keys can be derived in this environment. */
export function hasEncryptionKey(): boolean {
  const secret = process.env.SESSION_SECRET;
  return Boolean(secret && secret.length >= 32);
}

/**
 * Encrypt with AES-256-GCM. Output: `v1.<iv>.<tag>.<ciphertext>`, base64url.
 *
 * The version prefix is what makes key rotation possible later without a flag
 * day: a v2 box can be introduced while v1 boxes still decrypt.
 */
export function seal(plaintext: string, purpose: KeyPurpose): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(purpose), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function open(box: string, purpose: KeyPurpose): string {
  const [version, iv, tag, ciphertext] = box.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw errors.internal('Malformed secret box.');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(purpose), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function sign(payload: string, purpose: KeyPurpose): string {
  return createHmac('sha256', deriveKey(purpose)).update(payload).digest('base64url');
}

/** Constant-time signature check. */
export function verifySignature(payload: string, signature: string, purpose: KeyPurpose): boolean {
  const expected = Buffer.from(sign(payload, purpose));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Constant-time string comparison for secrets compared in application code. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
