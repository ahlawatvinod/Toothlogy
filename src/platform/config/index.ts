/**
 * TOOTHLOGY CONFIGURATION
 *
 * Environment access happens here and nowhere else. A `process.env.X` read
 * scattered through a division is untyped, unvalidated, undocumented, and
 * invisible to the logger's redaction list — four problems in one line.
 *
 * Design decisions worth stating:
 *
 * - **Validation is lazy and memoized, not top-of-module.** Next.js evaluates
 *   modules during `next build`, where production secrets are legitimately
 *   absent. Validating at import time would make the build require production
 *   credentials, which is how secrets end up in CI environments that should
 *   never have them.
 *
 * - **Requirements tighten in production.** `DATABASE_URL` and `SESSION_SECRET`
 *   are optional in development and test — the foundation must be runnable
 *   with no database — and mandatory in production, where their absence is a
 *   boot failure rather than a runtime surprise.
 *
 * - **Server config never reaches the client.** `getPublicConfig()` returns only
 *   `NEXT_PUBLIC_`-prefixed values, and the registry integrity test enforces that
 *   nothing secret carries that prefix.
 */

import { z } from 'zod';
import { AppError, ERROR_CODES } from '../kernel/errors';

export type Environment = 'development' | 'test' | 'production';

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).optional(),
  /**
   * 32 characters is the minimum for a signing key with meaningful entropy.
   * Enforced here rather than trusted to a deployment checklist.
   */
  SESSION_SECRET: z.string().min(32).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_DEFAULT_COUNTRY: z
    .string()
    .regex(/^[A-Z]{2}$/, 'Must be an ISO 3166-1 alpha-2 code')
    .default('IN'),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.string().min(2).default('en'),
});

export type ServerConfig = z.infer<typeof serverSchema>;
export type PublicConfig = z.infer<typeof publicSchema>;

let serverCache: ServerConfig | null = null;
let publicCache: PublicConfig | null = null;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

/**
 * Server configuration. Throws on malformed values, and in production also on
 * missing required ones — failing at boot rather than at the first request that
 * needs a database.
 */
export function getServerConfig(): ServerConfig {
  if (serverCache) return serverCache;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      `Invalid server configuration — ${formatIssues(parsed.error)}`,
      { expose: false },
    );
  }

  const config = parsed.data;

  if (config.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!config.DATABASE_URL) missing.push('DATABASE_URL');
    if (!config.SESSION_SECRET) missing.push('SESSION_SECRET');
    if (missing.length > 0) {
      // The message names the variables but never their values.
      throw new AppError(
        ERROR_CODES.INTERNAL,
        `Missing required production configuration: ${missing.join(', ')}`,
        { expose: false },
      );
    }
  }

  serverCache = config;
  return config;
}

/**
 * Public configuration — safe to serialise into a page or send to the browser.
 *
 * Values are read individually rather than from `process.env` wholesale, because
 * Next.js inlines `NEXT_PUBLIC_*` reads at build time only when they are
 * statically analysable. Spreading `process.env` would silently yield undefined
 * in the browser bundle.
 */
export function getPublicConfig(): PublicConfig {
  if (publicCache) return publicCache;

  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_DEFAULT_COUNTRY: process.env.NEXT_PUBLIC_DEFAULT_COUNTRY,
    NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
  });

  if (!parsed.success) {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      `Invalid public configuration — ${formatIssues(parsed.error)}`,
      { expose: false },
    );
  }

  publicCache = parsed.data;
  return publicCache;
}

export function getEnvironment(): Environment {
  const value = process.env.NODE_ENV;
  return value === 'production' || value === 'test' ? value : 'development';
}

export const isProduction = () => getEnvironment() === 'production';
export const isTest = () => getEnvironment() === 'test';
export const isDevelopment = () => getEnvironment() === 'development';

/**
 * Is a database configured? Callers use this to degrade gracefully rather than
 * crash: the Phase 0 foundation is deliberately runnable with no database, so
 * "not configured" must be an answerable question, not an exception.
 */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Test-only: clear the memo so a test can vary the environment. */
export function resetConfigCache(): void {
  serverCache = null;
  publicCache = null;
}
