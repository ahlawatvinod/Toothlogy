/**
 * TOOTHLOGY SECURITY SIGNALS
 *
 * Records security-relevant facts about an account and decides which ones the
 * owner must be told about immediately.
 *
 * NEW-DEVICE DETECTION, HONESTLY SCOPED
 * A sign-in is "from a new device" when neither its browser/OS family nor its
 * network (/24 for IPv4, /48 for IPv6) matches any successful sign-in in the
 * last 180 days. That is a heuristic, not device fingerprinting — deliberately:
 * fingerprinting is itself a privacy intrusion, and the purpose here is only to
 * tell a user "someone signed in from somewhere unfamiliar", which this does.
 * The very first sign-in of an account is never "new".
 */

import { EVENT_BY_NAME } from '@/registry/events';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { emitInTransaction } from '../events/outbox';
import { logger } from '../observability/logger';

export type SecurityEventType =
  | 'NEW_DEVICE_LOGIN'
  | 'SUSPICIOUS_LOGIN'
  | 'ACCOUNT_LOCKED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'RECOVERY_CODE_USED'
  | 'RECOVERY_CODES_REGENERATED'
  | 'EMAIL_VERIFIED'
  | 'PHONE_VERIFIED'
  | 'DELETION_REQUESTED'
  | 'ACCOUNT_RESTORED'
  | 'SESSIONS_REVOKED';

/** Plain-language description shown in the alert and the activity list. */
export const SECURITY_EVENT_COPY: Readonly<Record<SecurityEventType, string>> = {
  NEW_DEVICE_LOGIN: 'A sign-in from a device or network not seen on your account before',
  SUSPICIOUS_LOGIN: 'A sign-in that followed several failed password attempts',
  ACCOUNT_LOCKED: 'Sign-in was temporarily blocked after repeated failed attempts',
  PASSWORD_CHANGED: 'Your password was changed',
  PASSWORD_RESET: 'Your password was reset',
  MFA_ENABLED: 'Two-step verification was turned on',
  MFA_DISABLED: 'Two-step verification was turned off',
  RECOVERY_CODE_USED: 'A recovery code was used to sign in',
  RECOVERY_CODES_REGENERATED: 'New recovery codes were generated',
  EMAIL_VERIFIED: 'Your email address was verified',
  PHONE_VERIFIED: 'Your phone number was verified',
  DELETION_REQUESTED: 'Deletion of your account was requested',
  ACCOUNT_RESTORED: 'Your account was restored',
  SESSIONS_REVOKED: 'Other devices were signed out',
};

/**
 * Events the owner is alerted to on every channel. Routine confirmations
 * (email verified) are recorded but not alerted: alerting on everything trains
 * users to ignore alerts, which is the one outcome a security alert cannot
 * afford.
 */
const ALERTED: ReadonlySet<SecurityEventType> = new Set([
  'NEW_DEVICE_LOGIN',
  'SUSPICIOUS_LOGIN',
  'ACCOUNT_LOCKED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'MFA_DISABLED',
  'RECOVERY_CODE_USED',
  'DELETION_REQUESTED',
]);

export interface SecurityContext {
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly requestId?: string;
}

/**
 * Record a security event, and — for alerted types — queue the alert in the
 * same transaction, so an alert can never be sent for an event that was not
 * recorded, nor an event recorded without its alert.
 *
 * Never throws: a failure to record a signal must not fail the sign-in or the
 * password change that produced it.
 */
export async function recordSecurityEvent(
  userId: string,
  type: SecurityEventType,
  context: SecurityContext = {},
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await transaction(async (tx) => {
      const id = newId('securityEvent');
      await tx.securityEvent.create({
        data: {
          id,
          userId,
          type,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
          detail: detail ? (detail as never) : undefined,
        },
      });

      if (ALERTED.has(type) && EVENT_BY_NAME.has('SECURITY_ALERT_RAISED')) {
        await emitInTransaction(
          tx,
          'SECURITY_ALERT_RAISED',
          { userId, securityEventId: id, type },
          { requestId: context.requestId, actor: userId },
        );
      }
    });
  } catch (error) {
    logger.error('Failed to record security event', { type, error });
  }
}

/** The recent security activity a user sees on their security page. */
export async function listSecurityEvents(userId: string, limit = 20) {
  const rows = await db().securityEvent.findMany({
    where: { userId },
    orderBy: { occurredAt: 'desc' },
    take: Math.min(limit, 100),
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    description: SECURITY_EVENT_COPY[r.type as SecurityEventType] ?? r.type,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    occurredAt: r.occurredAt,
  }));
}

// ---------------------------------------------------------------------------
// Login risk
// ---------------------------------------------------------------------------

/** Coarse browser + OS family: "Chrome/Windows". Versions change weekly; families do not. */
export function deviceFamily(userAgent: string | null | undefined): string {
  if (!userAgent) return 'unknown';
  const browser =
    /Edg\//.test(userAgent)
      ? 'Edge'
      : /OPR\//.test(userAgent)
        ? 'Opera'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Chrome\//.test(userAgent)
            ? 'Chrome'
            : /Safari\//.test(userAgent)
              ? 'Safari'
              : 'Other';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Other';
  return `${browser}/${os}`;
}

/** Network prefix: /24 for IPv4, /48 for IPv6. Home routers renumber within these. */
export function networkPrefix(ip: string | null | undefined): string {
  if (!ip) return 'unknown';
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':');
  return ip.split('.').slice(0, 3).join('.');
}

export interface LoginAssessment {
  readonly newDevice: boolean;
  readonly suspicious: boolean;
}

/**
 * Assess a successful sign-in against the account's history. Call it BEFORE
 * recording the current attempt, so the current sign-in is not its own
 * precedent.
 */
export async function assessLogin(
  userId: string,
  identifier: string,
  context: SecurityContext,
): Promise<LoginAssessment> {
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000);
  const history = await db().loginAttempt.findMany({
    where: { userId, success: true, occurredAt: { gte: since } },
    select: { ipAddress: true, userAgent: true },
    orderBy: { occurredAt: 'desc' },
    take: 200,
  });

  const family = deviceFamily(context.userAgent);
  const network = networkPrefix(context.ipAddress);
  const newDevice =
    history.length > 0 &&
    !history.some(
      (h) => deviceFamily(h.userAgent) === family || networkPrefix(h.ipAddress) === network,
    );

  const recentFailures = await db().loginAttempt.count({
    where: {
      identifier,
      success: false,
      occurredAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });

  return { newDevice, suspicious: recentFailures >= 5 };
}
