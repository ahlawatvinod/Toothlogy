/**
 * Vitest configuration.
 *
 * TWO PROJECTS, DELIBERATELY
 *
 * Unit and integration tests have incompatible parallelism requirements:
 *
 * - **Unit** tests touch no shared state, so they run in parallel across files.
 * - **Integration** tests share ONE PostgreSQL database and truncate it between
 *   tests. Run in parallel, two files truncate each other mid-test and produce
 *   failures that look like real bugs but are pure interference — the worst
 *   kind of flake, because it sends you debugging correct code.
 *
 * Splitting them keeps the fast suite fast and the database suite correct,
 * rather than forcing one compromise on both.
 */

import { existsSync, readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * Load `.env.local` for integration tests.
 *
 * Vitest does not read env files, and integration tests need `DATABASE_URL`.
 * Parsed here rather than pulled in as a dependency because the format needed
 * is trivial and this runs before anything else.
 *
 * Existing environment variables win, so CI — which sets `DATABASE_URL` for its
 * postgres service — is never overridden by a developer's local file.
 */
function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync('.env.local')) return out;

  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) out[key] = value;
  }
  return out;
}

// `as const` on NODE_ENV: Vitest types it as the narrow ProcessEnv union, and a
// widened `string` is rejected.
const sharedEnv = { ...loadEnvLocal(), NODE_ENV: 'test' as const };

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    /**
     * `threads`, not the default `forks`.
     *
     * The forks pool loads the environment through CommonJS `require`, and
     * happy-dom / jsdom dependency chains are ESM-only, which fails with
     * ERR_REQUIRE_ESM before any test runs. Worker threads use the ESM loader.
     */
    pool: 'threads',
    env: sharedEnv,

    projects: [
      {
        plugins: [tsconfigPaths(), react()],
        test: {
          name: 'unit',
          globals: true,
          pool: 'threads',
          env: sharedEnv,
          environment: 'node',
          setupFiles: ['./tests/setup.ts'],
          include: ['tests/**/*.test.{ts,tsx}'],
          exclude: ['tests/integration/**'],
          testTimeout: 15_000,
        },
      },
      {
        plugins: [tsconfigPaths(), react()],
        test: {
          name: 'integration',
          globals: true,
          pool: 'threads',
          env: sharedEnv,
          environment: 'node',
          setupFiles: ['./tests/setup.ts'],
          include: ['tests/integration/**/*.test.ts'],
          // One file at a time: they share a database and truncate it.
          fileParallelism: false,
          // Real database round trips, plus scrypt hashing on every registration.
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],

    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/app/**/layout.tsx'],
    },
  },
});
