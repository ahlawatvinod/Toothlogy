/**
 * TOOTHLOGY JOB SCHEDULER (local / single-host)
 *
 * Calls POST /api/v1/internal/jobs on an interval, authenticated with
 * JOB_RUNNER_SECRET. This is the whole scheduler: the jobs themselves live in
 * the application (src/platform/jobs) and are safe to run concurrently, so in
 * production a platform cron hitting the same endpoint replaces this script
 * without any change to the jobs.
 *
 *   JOB_RUNNER_SECRET=… APP_URL=http://localhost:3000 npm run worker
 *
 * Reads .env.local for convenience when the variables are not already set.
 */

import { existsSync, readFileSync } from 'node:fs';

function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

loadEnvLocal();

const secret = process.env.JOB_RUNNER_SECRET;
const base = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const intervalSeconds = Number(process.env.WORKER_INTERVAL_SECONDS ?? 30);

if (!secret || secret.length < 32) {
  console.error('JOB_RUNNER_SECRET must be set (32+ characters). The scheduler cannot authenticate without it.');
  process.exit(1);
}

async function tick() {
  const started = Date.now();
  try {
    const response = await fetch(`${base}/api/v1/internal/jobs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: '{}',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      console.error(`[worker] ${response.status}`, payload?.error ?? '');
      return;
    }
    const summary = payload.data.reports
      .map((r) => `${r.name}:${r.ok ? 'ok' : `FAILED(${r.error})`}`)
      .join(' ');
    console.log(`[worker] ${new Date().toISOString()} ${Date.now() - started}ms ${summary}`);
  } catch (error) {
    // The app may be restarting; the next tick will try again.
    console.error('[worker] could not reach the application:', error.message);
  }
}

console.log(`[worker] calling ${base}/api/v1/internal/jobs every ${intervalSeconds}s`);
await tick();
setInterval(tick, intervalSeconds * 1000);
