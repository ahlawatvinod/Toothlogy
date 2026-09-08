/**
 * Global test setup.
 *
 * Two things happen here, both of which prevent a class of confusing failure:
 *
 * 1. **`NODE_ENV` is pinned to `test`.** Config, flags and the logger all branch
 *    on it, so leaving it ambiguous would make tests pass or fail depending on
 *    how they were invoked.
 * 2. **Logging is silenced by default.** The structured logger writes JSON to
 *    stdout; without this, every test that touches an audited path floods the
 *    output and hides the actual failure. `tests/platform/logging.test.ts`
 *    installs its own sink to assert on log content.
 */

import { afterEach, beforeAll } from 'vitest';
import { resetLogSink, setLogSink } from '@/platform/observability/logger';
import { resetAuditSink } from '@/platform/audit';
import { clearAllSubscribers } from '@/platform/events';
import { resetConfigCache } from '@/platform/config';

beforeAll(() => {
  // NODE_ENV is set to 'test' by vitest.config.mts rather than assigned here:
  // Next.js types `process.env.NODE_ENV` as read-only, so assigning it is a
  // type error, and the config is the honest place for it anyway.
  // Discard log output. Suites that assert on logs override this themselves.
  setLogSink(() => {});
});

afterEach(() => {
  // Subscribers and sinks are module-level state. Without this reset, a
  // subscriber registered by one test fires during another and the failure
  // appears in an unrelated file — the hardest kind of test flake to trace.
  clearAllSubscribers();
  resetAuditSink();
  resetConfigCache();
  setLogSink(() => {});
});

export { resetLogSink };
