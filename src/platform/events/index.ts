/**
 * TOOTHLOGY DOMAIN EVENT BUS
 *
 * Founding spec §13. Events are how divisions stay decoupled: a division
 * announces a fact about its own data, and other divisions react without the
 * publisher knowing they exist.
 *
 * Two properties are non-obvious and deliberate.
 *
 * **Unregistered event names are rejected.** Publishing `APPOINTMENT_CONFIRMD`
 * with a typo would otherwise succeed silently and simply reach no subscribers —
 * the appointment confirms, no notification is sent, and nothing anywhere
 * reports an error. Validating against the registry turns that into an immediate,
 * obvious failure.
 *
 * **A failing subscriber cannot break the publisher or its siblings.** Each
 * handler is isolated and its failure is logged. A notification provider being
 * down must not roll back a confirmed appointment.
 *
 * This is an in-process bus. Durable delivery uses the transactional outbox: the
 * event row is written in the same transaction as the state change, and a relay
 * publishes it afterwards. That is what makes it impossible to emit an event for
 * a change that rolled back — the case that produces "your appointment is
 * confirmed" emails for appointments that do not exist.
 */

import { isKnownEvent } from '@/registry/events';
import { AppError, ERROR_CODES, toAppError } from '../kernel/errors';
import { logger } from '../observability/logger';

/** Envelope wrapping every published event. */
export interface DomainEvent<TPayload = unknown> {
  /** Registered event name, e.g. `APPOINTMENT_CONFIRMED`. */
  readonly name: string;
  readonly payload: TPayload;
  readonly occurredAt: Date;
  /** Correlates the event with the request that caused it (founding spec §22). */
  readonly requestId?: string;
  /** Who caused it — a user ID, or a named system actor. */
  readonly actor?: string;
}

export type EventHandler<TPayload = unknown> = (
  event: DomainEvent<TPayload>,
) => void | Promise<void>;

export interface Subscription {
  /** Remove this subscriber. */
  readonly unsubscribe: () => void;
}

const handlers = new Map<string, Set<EventHandler<never>>>();

/**
 * Subscribe to an event.
 *
 * The name is validated at subscription time as well as publication time, so a
 * typo in a subscriber fails at startup rather than presenting as "the handler
 * never runs" months later.
 */
export function subscribe<TPayload = unknown>(
  eventName: string,
  handler: EventHandler<TPayload>,
): Subscription {
  if (!isKnownEvent(eventName)) {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      `Cannot subscribe to unregistered event '${eventName}'. Register it in src/registry/events.ts first.`,
      { expose: false },
    );
  }

  const set = handlers.get(eventName) ?? new Set();
  set.add(handler as EventHandler<never>);
  handlers.set(eventName, set);

  return {
    unsubscribe: () => {
      handlers.get(eventName)?.delete(handler as EventHandler<never>);
    },
  };
}

/**
 * Publish an event to all subscribers.
 *
 * Handlers run concurrently and every one is awaited, so a caller that awaits
 * `publish` knows all handlers finished. Failures are collected and logged
 * rather than thrown: from the publisher's perspective the fact already
 * happened, and a subscriber's failure does not un-happen it.
 */
export async function publish<TPayload>(
  name: string,
  payload: TPayload,
  meta: { requestId?: string; actor?: string } = {},
): Promise<DomainEvent<TPayload>> {
  if (!isKnownEvent(name)) {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      `Cannot publish unregistered event '${name}'. Register it in src/registry/events.ts first.`,
      { expose: false },
    );
  }

  const event: DomainEvent<TPayload> = {
    name,
    payload,
    occurredAt: new Date(),
    ...meta,
  };

  const subscribers = handlers.get(name);
  if (!subscribers || subscribers.size === 0) return event;

  const log = logger.child({ event: name, requestId: meta.requestId });

  await Promise.all(
    [...subscribers].map(async (handler) => {
      try {
        await (handler as EventHandler<TPayload>)(event);
      } catch (error) {
        // Isolated: one bad handler must not stop the others.
        const appError = toAppError(error);
        log.error('Event handler failed', {
          error: appError,
          errorCode: appError.code,
        });
      }
    }),
  );

  return event;
}

/** Number of subscribers for an event. Used by tests and diagnostics. */
export function subscriberCount(eventName: string): number {
  return handlers.get(eventName)?.size ?? 0;
}

/** Test-only: drop every subscriber so suites do not leak into each other. */
export function clearAllSubscribers(): void {
  handlers.clear();
}

// ---------------------------------------------------------------------------
// Transactional outbox
// ---------------------------------------------------------------------------

/**
 * A record written to the `OutboxEvent` table inside the same transaction as
 * the state change it describes.
 *
 * The guarantee: if the transaction commits, the event is committed with it and
 * will be delivered; if it rolls back, the event vanishes with it. Publishing
 * directly from application code cannot offer that — the process can die between
 * the commit and the publish.
 *
 * 🟡 PREPARED. The relay that reads this table and publishes to the bus lands
 * with the database in Phase 1.
 */
export interface OutboxRecord {
  readonly id: string;
  readonly name: string;
  readonly payload: unknown;
  readonly occurredAt: Date;
  readonly requestId: string | null;
  readonly actor: string | null;
  readonly publishedAt: Date | null;
  readonly attempts: number;
}

/** Build an outbox row. Persisting it is the caller's transaction to own. */
export function toOutboxRecord(
  event: DomainEvent,
  id: string,
): Omit<OutboxRecord, 'publishedAt' | 'attempts'> {
  return {
    id,
    name: event.name,
    payload: event.payload,
    occurredAt: event.occurredAt,
    requestId: event.requestId ?? null,
    actor: event.actor ?? null,
  };
}
