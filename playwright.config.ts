/**
 * Playwright: real-browser end-to-end tests.
 *
 * They run against a development server that is already running (the
 * project's `toothlogy-web` launch configuration, port 3020) and its
 * development database — never production. The browser is the installed
 * Google Chrome, so no browser download is needed.
 *
 * One worker, in order: the flows share one practice's diary.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // First visits compile routes on demand in development: generous timeouts.
  timeout: 300_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3020',
    channel: 'chrome',
    headless: true,
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: './test-results/e2e',
});
