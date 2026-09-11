/**
 * TOOTHLOGY TRANSACTIONAL OUTBOX — writer, durable handlers and relay
 *
 * The contract, end to end:
 *
 *   service transaction ──writes──> state change + outbox row   (one commit)
 *   relay ──leases──> outbox row ──runs──> durable handlers ──> receipts
 *
 * A domain event exists if and only if the change it describes committed.
 * Handlers run after the commit, at least once, and are made effectively
 * exactly-once by a per-handler receipt: when one handler fails and the event
 * is retried, the handlers that already succeeded are skipped.
 *
 * WHY A LEASE RATHER THAN A LONG TRANSACTION
 * The relay claims a batch by pushing `nextAttemptAt` forward inside one
 * `UPDATE … FOR UPDATE SKIP LOCKED`, then processes it outside any
 * transaction. Holding a transaction open while a handler calls an SMS
 * provider would pin row locks for the duration of someone else's outage; the
 * lease lets two relays run concurrently without ever taking the same event,
 * and a relay that crashes simply lets its lease lapse.
 */

import { isKnownEvent } from '@/registry/events';
import { AppError, ERROR_CODES, toAppError } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, type TransactionClient } from '../db/client';
import { logger } from '../observability/logger';
import { publish, type DomainEvent } from './index';

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Record a domain event inside the caller's transaction.
 *
 * The event name is checked against the registry here, at write time, so a
 * typo fails the transaction that contains it rather than producing an event
 * no handler will ever match.
 */
export async function emitInTransaction(
  tx: TransactionClient,
  name: string,
  payload: Record<string, unknown>,
  meta: { requestId?: string | null; actor?: string | null } = {},
): Promise<string> {
  if (!isKnownEvent(name)) {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      `Cannot emit unregistered event '${name}'. Register it in src/registry/events.ts first.`,
      { expose: false },
    );
  }

  const id = newId('outboxEvent');
  await tx.outboxEvent.create({
    data: {
      id,
      name,
      payload: payload as never,
      requestId: meta.requestId ?? null,
      actor: meta.actor ?? null,
    },
  });
  return id;
}

// ---------------------------------------------------------------------------
// Durable handlers
// ---------------------------------------------------------------------------

export interface OutboxDelivery<TPayload = Record<string, unknown>> extends DomainEvent<TPayload> {
  /** The outbox row id. Stable across retries — use it as a dedupe key. */
  readonly id: string;
  readonly attempt: number;
}

export type DurableHandler = (event: OutboxDelivery) => Promise<void>;

interface RegisteredHandler {
  readonly key: string;
  readonly handle: DurableHandler;
}

const durableHandlers = new Map<string, RegisteredHandler[]>();

/**
 * Register a handler that runs from the outbox.
 *
 * `key` must be stable forever: it is the receipt's identity. Renaming a
 * handler makes every past event look unhandled by it.
 */
export function registerDurableHandler(eventName: string, key: string, handle: DurableHandler): void {
  if (!isKnownEvent(eventName)) {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      `Cannot subscribe to unregistered event '${eventName}'.`,
      { expose: false },
    );
  }
  const list = durableHandlers.get(eventName) ?? [];
  if (list.some((h) => h.key === key)) return; // Idempotent registration.
  list.push({ key, handle });
  durableHandlers.set(eventName, list);
}

export function durableHandlerKeys(eventName: string): string[] {
  return (durableHandlers.get(eventName) ?? []).map((h) => h.key);
}

/** Test-only. */
export function clearDurableHandlers(): void {
  durableHandlers.clear();
}

// ---------------------------------------------------------------------------
// Relay
// ---------------------------------------------------------------------------

/** Minutes before retry n (1-based). Exhausting the list marks the event dead. */
const RETRY_MINUTES = [1, 5, 30, 120, 480];
export const OUTBOX_MAX_ATTEMPTS = RETRY_MINUTES.length + 1;
/** How long a claimed batch is reserved for the relay that claimed it. */
const LEASE_MINUTES = 5;

export interface RelayResult {
  readonly claimed: number;
  readonly published: number;
  readonly retried: number;
  readonly dead: number;
}

interface ClaimedRow {
  id: string;
  name: string;
  payload: unknown;
  requestId: string | null;
  actor: string | null;
  occurredAt: Date;
  attempts: number;
}

/**
 * Publish due outbox events.
 *
 * Safe to run from any number of processes at once. Returns counts so the job
 * runner can report what it did.
 */
export async function relayOutbox(options: { batchSize?: number } = {}): Promise<RelayResult> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 50, 1), 500);

  const rows = await db().$queryRaw<ClaimedRow[]>`
    UPDATE "outbox_events"
    SET "nextAttemptAt" = now() + (${LEASE_MINUTES} * interval '1 minute')
    WHERE "id" IN (
      SELECT "id" FROM "outbox_events"
      WHERE "publishedAt" IS NULL
        AND "deadAt" IS NULL
        AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
      ORDER BY "occurredAt"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "name", "payload", "requestId", "actor", "occurredAt", "attempts"
  `;

  let published = 0;
  let retried = 0;
  let dead = 0;

  // Sequential, in occurrence order: an APPOINTMENT_CANCELLED must not be
  // handled before the APPOINTMENT_CONFIRMED it follows.
  for (const row of rows) {
    const outcome = await deliver(row);
    if (outcome === 'published') published += 1;
    else if (outcome === 'dead') dead += 1;
    else retried += 1;
  }

  return { claimed: rows.length, published, retried, dead };
}

async function deliver(row: ClaimedRow): Promise<'published' | 'retry' | 'dead'> {
  const attempt = row.attempts + 1;
  const event: OutboxDelivery = {
    id: row.id,
    name: row.name,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    occurredAt: row.occurredAt,
    requestId: row.requestId ?? undefined,
    actor: row.actor ?? undefined,
    attempt,
  };

  const log = logger.child({ outboxEventId: row.id, event: row.name, attempt });
  const failures: string[] = [];

  const done = new Set(
    (
      await db().eventHandlerReceipt.findMany({
        where: { eventId: row.id },
        select: { handler: true },
      })
    ).map((r) => r.handler),
  );

  for (const handler of durableHandlers.get(row.name) ?? []) {
    if (done.has(handler.key)) continue;
    try {
      await handler.handle(event);
      await db().eventHandlerReceipt.createMany({
        data: [{ eventId: row.id, handler: handler.key }],
        skipDuplicates: true,
      });
    } catch (error) {
      const appError = toAppError(error);
      failures.push(`${handler.key}: ${appError.code} ${appError.expose ? appError.message : ''}`.trim());
      log.error('Durable handler failed', { handler: handler.key, error: appError });
    }
  }

  // In-process subscribers (caches, metrics) are notified too. Their failures
  // are isolated by the bus and do not hold the event back.
  await publish(row.name, event.payload, { requestId: event.requestId, actor: event.actor });

  if (failures.length === 0) {
    await db().outboxEvent.update({
      where: { id: row.id },
      data: { publishedAt: new Date(), attempts: attempt, lastError: null, nextAttemptAt: null },
    });
    return 'published';
  }

  const lastError = failures.join('; ').slice(0, 2000);
  const delayMinutes = RETRY_MINUTES[attempt - 1];

  if (delayMinutes === undefined) {
    await db().outboxEvent.update({
      where: { id: row.id },
      data: { attempts: attempt, lastError, deadAt: new Date(), nextAttemptAt: null },
    });
    log.error('Outbox event is dead after exhausting retries', { lastError });
    return 'dead';
  }

  await db().outboxEvent.update({
    where: { id: row.id },
    data: {
      attempts: attempt,
      lastError,
      nextAttemptAt: new Date(Date.now() + delayMinutes * 60 * 1000),
    },
  });
  return 'retry';
}

/**
 * Put dead events back in the queue. For an operator, after fixing the cause
 * (a misconfigured provider, a bad template). Handlers that already succeeded
 * are still skipped by their receipts.
 */
export async function replayDeadEvents(ids?: readonly string[]): Promise<number> {
  const result = await db().outboxEvent.updateMany({
    where: { deadAt: { not: null }, ...(ids ? { id: { in: [...ids] } } : {}) },
    data: { deadAt: null, nextAttemptAt: null, attempts: 0 },
  });
  return result.count;
}

/** Queue health for the admin console and the health check. */
export async function outboxStats(): Promise<{ pending: number; dead: number; oldestPendingAt: Date | null }> {
  const [pending, dead, oldest] = await Promise.all([
    db().outboxEvent.count({ where: { publishedAt: null, deadAt: null } }),
    db().outboxEvent.count({ where: { deadAt: { not: null } } }),
    db().outboxEvent.findFirst({
      where: { publishedAt: null, deadAt: null },
      orderBy: { occurredAt: 'asc' },
      select: { occurredAt: true },
    }),
  ]);
  return { pending, dead, oldestPendingAt: oldest?.occurredAt ?? null };
}
