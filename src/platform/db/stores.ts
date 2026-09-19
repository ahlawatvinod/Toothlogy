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
import { db, isWriteConflict } from './client';

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Database-backed fixed-window rate limiter.
 *
 * The increment and the read are one indivisible step. That is the point: a
 * read-then-write would let two concurrent requests both read count=4, both
 * write 5, and both pass a limit of 5.
 *
 * HOW THAT IS DONE ON MYSQL
 * MySQL has `INSERT … ON DUPLICATE KEY UPDATE` but no `RETURNING`, so the
 * single PostgreSQL statement this replaced becomes an upsert and a select
 * inside one transaction. It is still atomic: the upsert takes an exclusive
 * lock on the counter row that InnoDB holds until the transaction commits, so
 * a concurrent request for the same key waits at its own upsert, and the
 * select — which always sees its own transaction's write — reads exactly the
 * value this request produced. `tests/integration/rate-limit.test.ts` fires
 * concurrent hits at one key and asserts the limit holds exactly.
 *
 * The window resets inside the same upsert: if the stored window has expired,
 * it starts a fresh one rather than incrementing a stale count.
 */
export class DatabaseRateLimitStore implements RateLimitStore {
  async hit(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    const windowKey = `${policy.name}:${key}`;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + policy.windowSeconds * 1000);

    let row: { count: number; windowEndsAt: Date } | undefined;
    for (let attempt = 1; ; attempt += 1) {
      try {
        const [, rows] = await db().$transaction(
          [
            // ORDER MATTERS. MySQL evaluates these assignments left to right and
            // a later one sees the value an earlier one just wrote. `count` must
            // be decided while `windowEndsAt` still holds the OLD window; swap
            // them and an expired window is extended before `count` checks it,
            // so the count never resets and the key stays blocked for good.
            db().$executeRaw`
              INSERT INTO \`rate_limit_counters\` (\`key\`, \`count\`, \`windowEndsAt\`)
              VALUES (${windowKey}, 1, ${windowEnd})
              ON DUPLICATE KEY UPDATE
                \`count\` = IF(\`windowEndsAt\` <= ${now}, 1, \`count\` + 1),
                \`windowEndsAt\` = IF(\`windowEndsAt\` <= ${now}, ${windowEnd}, \`windowEndsAt\`)
            `,
            db().$queryRaw<Array<{ count: number; windowEndsAt: Date }>>`
              SELECT \`count\`, \`windowEndsAt\`
              FROM \`rate_limit_counters\`
              WHERE \`key\` = ${windowKey}
            `,
          ],
          // Read committed takes no gap locks, which is what keeps concurrent
          // first hits on different new keys from deadlocking each other.
          { isolationLevel: 'ReadCommitted' },
        );
        row = rows[0];
        break;
      } catch (error) {
        // Two first hits racing to insert the same new key can deadlock on
        // MySQL; InnoDB resolves it by rolling one back (P2034). That request
        // simply goes again and lands on the row the winner created.
        //
        // Any OTHER error propagates exactly as it did on PostgreSQL. Only the
        // deadlock is new with this engine, so only the deadlock gets the
        // fail-open treatment below — once it has persisted past its retries.
        if (!isWriteConflict(error)) throw error;
        if (attempt < 3) continue;
        logger.error('Rate limit statement kept deadlocking; allowing the request', {
          key: windowKey,
          attempts: attempt,
        });
        break;
      }
    }

    if (!row) {
      // A rate limiter that throws takes down every request it protects.
      // Failing open is the correct trade here: the alternative is an outage
      // caused by the safety mechanism.
      return { allowed: true, remaining: policy.limit, retryAfterSeconds: 0 };
    }

    // `count` is INT, which the driver returns as a number — but coerce anyway,
    // so a future widening to BIGINT cannot turn this comparison into bigint
    // arithmetic that throws.
    const count = Number(row.count);
    const allowed = count <= policy.limit;
    return {
      allowed,
      remaining: Math.max(0, policy.limit - count),
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
