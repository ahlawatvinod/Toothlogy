/**
 * TOOTHLOGY RUNTIME BOOTSTRAP
 *
 * Swaps Phase 0's in-memory placeholders for their persistent implementations,
 * once, at first use.
 *
 * WHY THIS IS NOT A TOP-LEVEL SIDE EFFECT
 * Next.js has no single entry point that runs before every route: server
 * components, route handlers and middleware are separate execution contexts,
 * and a module with import-time side effects runs at unpredictable moments —
 * including during `next build`, where no database exists. `ensureBootstrapped()`
 * is called explicitly by the request handler instead, so the wiring happens
 * exactly when a request needs it and never during a build.
 *
 * WHY IT DEGRADES INSTEAD OF THROWING
 * With no `DATABASE_URL` the platform keeps the in-memory stores. That preserves
 * the Phase 0 property that the app runs standalone for a new contributor — and
 * the health endpoint reports the database as unhealthy, so the degraded state
 * is visible rather than silent.
 */

import { hasDatabase } from './config';
import { setAuditSink } from './audit';
import { logger } from './observability/logger';

let bootstrapped = false;

export function ensureBootstrapped(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  if (!hasDatabase()) {
    logger.warn(
      'No DATABASE_URL configured — audit, rate limiting and idempotency are using in-memory stores. Not suitable for production.',
    );
    return;
  }

  // Imported lazily so a build with no database never loads the Prisma client.
  void import('./db/stores').then(({ writeAuditEventToDatabase }) => {
    setAuditSink(async (event) => {
      await writeAuditEventToDatabase(event);
    });
    logger.info('Platform bootstrapped with persistent stores');
  });
}

/** Test-only: allow a suite to re-run bootstrap after swapping configuration. */
export function resetBootstrap(): void {
  bootstrapped = false;
}
