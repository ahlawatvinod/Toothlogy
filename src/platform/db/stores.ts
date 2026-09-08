/**
 * TOOTHLOGY PERSISTENT PLATFORM STORES
 *
 * Phase 0 shipped in-memory implementations of rate limiting, idempotency and
 * audit, each with a comment saying it was per-process and had to be replaced.
 * This file is that replacement.
 *
 * These three were the honest gaps that mattered most:
 *
 * - An in-memory **rate limiter** behind N instances allows N times the
 *   intended limit — and it is *trusted*, which makes it worse than none.
 * - An in-memory **idempotency store** loses its records on restart, so a
 *   retry after a deploy charges the customer twice.
 * - An in-memory **audit log** is not an audit log.
 */

import { newId } from '../kernel/ids';
import { logger } from '../observability/logger';
import type { AuditEvent } from '../audit';
import type {
  IdempotencyRecord,
  IdempotencyStore,
  RateLimitPolicy,
  RateLimitResult,
  RateLimitStore,
} from '../http/security';
import { db } from './client';

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Database-backed fixed-window rate limiter.
 *
 * The whole operation is one atomic SQL statement. That is the point: a
 * read-then-write would let two concurrent requests both read count=4, both
 * write 5, and both pass a limit of 5. `INSERT … ON CONFLICT DO UPDATE` with a
 * `RETURNING` clause makes the increment and the read a single indivisible step,
 * so the limit holds under concurrency — which is the only condition under
 * which a rate limit matters.
 *
 * The window resets by comparing `windowEndsAt` inside the same statement: if
 * the stored window has expired, the update starts a fresh one rather than
 * incrementing a stale count.
 */
export class DatabaseRateLimitStore implements RateLimitStore {
  async hit(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    const windowKey = `${policy.name}:${key}`;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + policy.windowSeconds * 1000);

    const rows = await db().$queryRaw<Array<{ count: number; windowEndsAt: Date }>>`
      INSERT INTO "rate_limit_counters" ("key", "count", "windowEndsAt")
      VALUES (${windowKey}, 1, ${windowEnd})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "rate_limit_counters"."windowEndsAt" <= ${now}
            THEN 1
          ELSE "rate_limit_counters"."count" + 1
        END,
        "windowEndsAt" = CASE
          WHEN "rate_limit_counters"."windowEndsAt" <= ${now}
            THEN ${windowEnd}
          ELSE "rate_limit_counters"."windowEndsAt"
        END
      RETURNING "count", "windowEndsAt"
    `;

    const row = rows[0];
    if (!row) {
      // Cannot happen with RETURNING, but a rate limiter that throws would take
      // down every request it protects. Failing open is the correct trade here:
      // the alternative is an outage caused by the safety mechanism.
      logger.error('Rate limit statement returned no row', { key: windowKey });
      return { allowed: true, remaining: policy.limit, retryAfterSeconds: 0 };
    }

    const allowed = row.count <= policy.limit;
    return {
      allowed,
      remaining: Math.max(0, policy.limit - row.count),
      retryAfterSeconds: allowed
        ? 0
        : Math.max(1, Math.ceil((row.windowEndsAt.getTime() - now.getTime()) / 1000)),
    };
  }

  /** Delete expired windows. Called by the maintenance job; safe to run anytime. */
  async prune(): Promise<number> {
    const result = await db().rateLimitCounter.deleteMany({
      where: { windowEndsAt: { lte: new Date() } },
    });
    return result.count;
  }
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/** How long a keyed result stays replayable. */
const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Database-backed idempotency store.
 *
 * 24 hours is chosen to comfortably exceed any client's retry window — mobile
 * apps retry across app restarts and network changes — while bounding table
 * growth. Beyond a day, a "retry" is a new intent by the user, not a duplicate
 * of the old one.
 */
export class DatabaseIdempotencyStore implements IdempotencyStore {
  async get(key: string): Promise<IdempotencyRecord | null> {
    const row = await db().idempotencyRecord.findUnique({ where: { key } });
    if (!row) return null;

    // An expired record is treated as absent rather than deleted here: deleting
    // during a read would make a GET perform a write, and pruning is the
    // maintenance job's responsibility.
    if (row.expiresAt <= new Date()) return null;

    return {
      key: row.key,
      fingerprint: row.fingerprint,
      statusCode: row.statusCode,
      responseBody: row.responseBody,
      createdAt: row.createdAt,
    };
  }

  async put(record: IdempotencyRecord): Promise<void> {
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3600 * 1000);

    await db().idempotencyRecord.upsert({
      where: { key: record.key },
      create: {
        id: newId('idempotency'),
        key: record.key,
        fingerprint: record.fingerprint,
        statusCode: record.statusCode,
        responseBody: record.responseBody as never,
        expiresAt,
      },
      // An upsert rather than a create: two concurrent retries of the same
      // request would both try to store the result, and the loser of that race
      // must not turn a successful operation into a 500.
      update: {
        fingerprint: record.fingerprint,
        statusCode: record.statusCode,
        responseBody: record.responseBody as never,
        expiresAt,
      },
    });
  }

  async prune(): Promise<number> {
    const result = await db().idempotencyRecord.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return result.count;
  }
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

const AUDIT_OUTCOME = {
  success: 'SUCCESS',
  failure: 'FAILURE',
  denied: 'DENIED',
} as const;

/**
 * Write an audit event to the database.
 *
 * Installed as the audit sink at boot (see `src/platform/bootstrap.ts`).
 *
 * `detail` is passed through the logger's redactor before it is written.
 * An audit row is permanent and immutable — a secret written into one cannot
 * be removed later, because Constitution §8 forbids deleting from this table.
 * Redacting on the way in is the only opportunity.
 */
export async function writeAuditEventToDatabase(event: AuditEvent): Promise<void> {
  const { redact } = await import('../observability/logger');

  await db().auditEvent.create({
    data: {
      id: event.id,
      action: event.action,
      actor: event.actor,
      subject: event.subject,
      outcome: AUDIT_OUTCOME[event.outcome],
      requestId: event.requestId ?? null,
      organizationId: event.organizationId ?? null,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
      detail: event.detail ? (redact(event.detail) as never) : undefined,
      occurredAt: event.occurredAt,
    },
  });
}

// ---------------------------------------------------------------------------
// Shared instances
// ---------------------------------------------------------------------------

export const databaseRateLimitStore = new DatabaseRateLimitStore();
export const databaseIdempotencyStore = new DatabaseIdempotencyStore();
