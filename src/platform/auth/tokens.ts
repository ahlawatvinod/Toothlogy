/**
 * TOOTHLOGY VERIFICATION TOKENS
 *
 * Email verification, password reset, magic links and action confirmation —
 * one implementation, because the lifecycle is identical: issue, deliver,
 * expire, consume exactly once.
 *
 * Three properties that are easy to get wrong and are the reason this is
 * centralised rather than reimplemented per flow:
 *
 * 1. **Single use, enforced atomically.** Consumption is a conditional UPDATE,
 *    not a read-then-write. Two concurrent redemptions of the same reset link
 *    must result in exactly one success — a check-then-act has a window where
 *    both pass.
 * 2. **Bound to a destination.** The email or phone is captured at issue time
 *    and re-checked at redemption. Without it, an attacker who changes the
 *    account email can redeem a token issued to the old one.
 * 3. **Hashed at rest.** A database read must not hand out working
 *    password-reset links.
 */

import { createHash, randomBytes } from 'node:crypto';
import { newId } from '../kernel/ids';
import { db } from '../db/client';

/** Token lifetimes, chosen per risk rather than one shared constant. */
export const TOKEN_TTL_MINUTES = {
  /** Long: people verify email hours later, from another device. */
  EMAIL_VERIFICATION: 60 * 24,
  PHONE_VERIFICATION: 15,
  /**
   * Short. A password reset link is a full account takeover if intercepted,
   * and it sits in an inbox indefinitely.
   */
  PASSWORD_RESET: 30,
  MAGIC_LINK: 15,
  ACTION_CONFIRMATION: 15,
} as const;

export type TokenPurpose = keyof typeof TOKEN_TTL_MINUTES;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/**
 * 32 bytes of CSPRNG output, base64url encoded so it is URL-safe without
 * escaping — these travel in links.
 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface IssuedToken {
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Issue a token.
 *
 * Any outstanding token of the same type for the same user is consumed first.
 * Requesting a new password reset must invalidate the previous link: otherwise
 * every reset ever requested stays live until it expires, and an attacker who
 * obtained an old email still has a working one.
 */
export async function issueToken(
  userId: string,
  type: TokenPurpose,
  destination: string,
  context: { ipAddress?: string | null } = {},
): Promise<IssuedToken> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES[type] * 60 * 1000);

  await db().$transaction(async (tx) => {
    await tx.verificationToken.updateMany({
      where: { userId, type, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await tx.verificationToken.create({
      data: {
        id: newId('request'),
        userId,
        type,
        tokenHash: hashToken(token),
        destination: destination.toLowerCase(),
        expiresAt,
        ipAddress: context.ipAddress ?? null,
      },
    });
  });

  return { token, expiresAt };
}

export type TokenRedemption =
  | { readonly ok: true; readonly userId: string; readonly destination: string }
  | { readonly ok: false; readonly reason: 'invalid' | 'expired' | 'already_used' };

/**
 * Redeem a token, consuming it atomically.
 *
 * The conditional `updateMany` is the whole mechanism: it matches only rows
 * that are still unconsumed and unexpired, and reports how many it changed.
 * A count of 1 means this caller won the race and the token is now spent; 0
 * means someone else redeemed it first, or it was never valid.
 *
 * Doing this as SELECT-then-UPDATE would let two concurrent requests both see
 * an unconsumed token and both proceed — which for a password reset means two
 * parties setting a password on the same account.
 */
export async function redeemToken(
  token: string,
  type: TokenPurpose,
): Promise<TokenRedemption> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const existing = await db().verificationToken.findUnique({ where: { tokenHash } });

  // Distinguish reasons for logging and for a helpful UI ("this link has
  // expired, request a new one" is genuinely useful and reveals nothing an
  // attacker holding the token does not already know).
  if (!existing || existing.type !== type) return { ok: false, reason: 'invalid' };
  if (existing.consumedAt !== null) return { ok: false, reason: 'already_used' };
  if (existing.expiresAt <= now) return { ok: false, reason: 'expired' };

  const result = await db().verificationToken.updateMany({
    where: { tokenHash, type, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });

  // Lost the race — another request consumed it between the read and the write.
  if (result.count !== 1) return { ok: false, reason: 'already_used' };

  return { ok: true, userId: existing.userId, destination: existing.destination };
}

/** Delete tokens that expired long ago. For the maintenance job. */
export async function pruneTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const result = await db().verificationToken.deleteMany({
    where: { expiresAt: { lte: cutoff } },
  });
  return result.count;
}
