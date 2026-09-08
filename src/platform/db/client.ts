/**
 * TOOTHLOGY DATABASE CLIENT
 *
 * One Prisma client for the process, plus the transaction helper every
 * multi-step write goes through.
 *
 * THE SINGLETON MATTERS IN DEVELOPMENT, NOT JUST IN PRODUCTION
 * Next.js hot-reloads modules on every edit. A `new PrismaClient()` at module
 * scope therefore creates a new client — and a new connection pool — on every
 * save, and within a few minutes the database refuses connections with
 * "too many clients already". Caching on `globalThis` survives module reload,
 * which is why this pattern exists rather than a plain module constant.
 *
 * FAILING HONESTLY WITHOUT A DATABASE
 * The Phase 0 foundation is runnable with no database configured, and that
 * property is worth keeping: a contributor should be able to clone, install and
 * see the app work. So the client is created lazily and `hasDatabase()` is the
 * question callers ask. Code that needs the database and does not have it gets
 * a typed NOT_CONFIGURED error, never a confusing connection stack trace.
 */

import { PrismaClient } from '@prisma/client';
import { getEnvironment, hasDatabase } from '../config';
import { errors } from '../kernel/errors';
import { logger } from '../observability/logger';

/**
 * Slow-query threshold. Anything above this is logged as a warning with its
 * duration so N+1 patterns and missing indexes surface during development
 * rather than in production under load.
 */
const SLOW_QUERY_MS = 200;

function createClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      getEnvironment() === 'development'
        ? [{ emit: 'event', level: 'query' }, { emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }]
        : [{ emit: 'stdout', level: 'error' }],
  });

  if (getEnvironment() === 'development') {
    // `as never` because Prisma's $on overloads do not narrow the 'query' event
    // type when the log array is built conditionally.
    (client.$on as never as (event: 'query', cb: (e: { duration: number; query: string }) => void) => void)(
      'query',
      (event) => {
        if (event.duration >= SLOW_QUERY_MS) {
          // The query text is logged, never its parameters — parameters carry
          // the actual patient data (Constitution §9).
          logger.warn('Slow query', { durationMs: event.duration, query: event.query });
        }
      },
    );
  }

  return client;
}

/**
 * Cached across hot reloads. Typed on globalThis rather than `any` so a
 * mistyped access is still a compile error.
 */
const globalForPrisma = globalThis as unknown as { toothlogyPrisma?: PrismaClient };

/**
 * The database client.
 *
 * Throws NOT_CONFIGURED rather than a driver error when `DATABASE_URL` is
 * absent, so a missing database reads as a configuration problem — which it is.
 */
export function db(): PrismaClient {
  if (!hasDatabase()) {
    throw errors.notConfigured('database');
  }

  if (!globalForPrisma.toothlogyPrisma) {
    globalForPrisma.toothlogyPrisma = createClient();
  }
  return globalForPrisma.toothlogyPrisma;
}

/** Prisma's transaction client — the type handed to a `$transaction` callback. */
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Run work inside a database transaction.
 *
 * Every multi-step write goes through this. The rule it enforces: a booking
 * that writes an appointment, a payment record and an outbox event either
 * writes all three or none. Partial writes are the failure mode that produces
 * an appointment with no confirmation email and no charge — and nothing in the
 * logs saying so.
 *
 * `timeout` is raised from Prisma's 5s default to 10s because a transaction
 * that also writes an audit event and an outbox row has more work to do than
 * the default assumes.
 *
 * `isolationLevel: 'ReadCommitted'` is PostgreSQL's default and is stated
 * explicitly so the choice is visible: operations needing stronger guarantees
 * (double-booking prevention) get them from a unique constraint rather than
 * from `Serializable`, which would serialise unrelated bookings across the
 * whole platform.
 */
export async function transaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  return db().$transaction(fn, {
    timeout: options.timeoutMs ?? 10_000,
    isolationLevel: 'ReadCommitted',
  });
}

/**
 * Is the database reachable?
 *
 * Used by the health check. Distinct from `hasDatabase()`, which only asks
 * whether a URL is configured — a configured but unreachable database is
 * exactly the state a readiness probe exists to detect.
 */
export async function isDatabaseReachable(): Promise<boolean> {
  if (!hasDatabase()) return false;
  try {
    await db().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Close the pool. For scripts and tests; the server keeps its pool for its lifetime. */
export async function disconnect(): Promise<void> {
  if (globalForPrisma.toothlogyPrisma) {
    await globalForPrisma.toothlogyPrisma.$disconnect();
    globalForPrisma.toothlogyPrisma = undefined;
  }
}

/**
 * Detect a unique-constraint violation.
 *
 * The pattern this supports: attempt the insert and handle the collision,
 * rather than SELECT-then-INSERT. A check-then-act has a race window in which
 * two concurrent requests both see "no existing row" and both insert — which is
 * exactly how double bookings and duplicate accounts happen. Letting the
 * database's unique index arbitrate is the only approach with no window.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return prismaErrorCode(error) === 'P2002';
}

/** Prisma's error code, or null if this is not a Prisma error. */
function prismaErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** Which fields collided, for turning a constraint error into a useful message. */
export function uniqueConstraintFields(error: unknown): string[] {
  if (!isUniqueConstraintError(error)) return [];
  const meta = (error as { meta?: { target?: unknown } }).meta;
  const target = meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  return [];
}

/** Detect "record not found" from an update or delete. */
export function isNotFoundError(error: unknown): boolean {
  return prismaErrorCode(error) === 'P2025';
}
