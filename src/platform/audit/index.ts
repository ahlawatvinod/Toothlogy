/**
 * TOOTHLOGY AUDIT LOG
 *
 * Constitution §8: the audit log is append-only and immutable. No division may
 * delete from it — including the division that owns it.
 *
 * An audit event answers, months later: *who did what, to what, when, from
 * where, and did it work?* That question gets asked during a security incident,
 * a clinical dispute, a payment reconciliation, or a regulator's request — all
 * situations where "we think it was probably…" is not an answer.
 *
 * The distinction from application logs matters. Logs are for engineers,
 * best-effort, and rotate away. Audit events are a durable record with
 * compliance weight: they are written in the same transaction as the change they
 * describe, retained on a schedule, and never edited.
 *
 * 🟡 PREPARED. The interface, redaction rules and call sites are implemented and
 * exercised by tests. Persistence to the `AuditEvent` table lands with the
 * database in Phase 1; until then events go to the structured log, clearly
 * marked, so nothing silently disappears.
 */

import { newId } from '../kernel/ids';
import { logger } from '../observability/logger';

export type AuditOutcome = 'success' | 'failure' | 'denied';

export interface AuditEventInput {
  /** What happened — usually a route or operation ID, e.g. `TL-API-REGISTRY-001`. */
  readonly action: string;
  /** Who did it: a user ID, or a named system actor. */
  readonly actor: string;
  /** What it was done to: a record ID or a resource path. */
  readonly subject: string;
  readonly outcome: AuditOutcome;
  /** Correlates with the request and its log lines. */
  readonly requestId?: string;
  /** The organization the action happened within, when scoped. */
  readonly organizationId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  /**
   * Additional structured context. Passed through the logger's redactor, so a
   * careless caller cannot put a password or clinical detail into a permanent
   * record.
   */
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface AuditEvent extends AuditEventInput {
  readonly id: string;
  readonly occurredAt: Date;
}

/** Sink for audit events. Swapped for a database writer in Phase 1. */
export type AuditSink = (event: AuditEvent) => void | Promise<void>;

/**
 * Until persistence exists, audit events go to the structured log tagged
 * `audit: true`, so they are filterable and their absence is never silent.
 */
const logSink: AuditSink = (event) => {
  logger.info('Audit event', {
    audit: true,
    auditId: event.id,
    action: event.action,
    actor: event.actor,
    subject: event.subject,
    outcome: event.outcome,
    requestId: event.requestId,
    organizationId: event.organizationId,
    occurredAt: event.occurredAt.toISOString(),
    detail: event.detail,
  });
};

let sink: AuditSink = logSink;

export function setAuditSink(next: AuditSink): void {
  sink = next;
}

export function resetAuditSink(): void {
  sink = logSink;
}

/**
 * Record an audit event.
 *
 * Never throws. An audit sink failure must not fail the user's request — a
 * patient's booking should not be rejected because an audit write timed out.
 * The failure is escalated to the error log instead, where it can alert.
 *
 * That trade-off is a deliberate availability-over-completeness choice, and it
 * is safe only because the Phase 1 database writer will run inside the same
 * transaction as the change it records: at that point an audit failure rolls the
 * change back rather than losing the record.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const event: AuditEvent = {
    ...input,
    id: newId('auditEvent'),
    occurredAt: new Date(),
  };

  try {
    await sink(event);
  } catch (error) {
    logger.error('Failed to record audit event', {
      auditAction: input.action,
      auditActor: input.actor,
      error,
    });
  }
}

/**
 * Record a denied authorization attempt.
 *
 * Separated because denials are a security signal, not merely a failed request.
 * A cluster of denials from one actor is how privilege probing looks from the
 * inside, and it should be findable without reading every audit row.
 */
export async function recordAccessDenied(input: {
  readonly actor: string;
  readonly permission: string;
  readonly subject: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
}): Promise<void> {
  await recordAuditEvent({
    action: 'ACCESS_DENIED',
    actor: input.actor,
    subject: input.subject,
    outcome: 'denied',
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    detail: { permission: input.permission },
  });
}
