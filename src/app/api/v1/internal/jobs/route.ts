/**
 * TL-API-JOBS-LIST-001 — GET  /api/v1/internal/jobs
 * TL-API-JOBS-RUN-001  — POST /api/v1/internal/jobs
 *
 * Runs the background jobs (outbox relay, notification retries, reminders,
 * expiry sweeps, erasure). Called by a scheduler — `npm run worker`, a system
 * cron, or a platform cron — every minute or so.
 *
 * TWO WAYS IN, BOTH EXPLICIT
 * - A scheduler presents `Authorization: Bearer <JOB_RUNNER_SECRET>`,
 *   compared in constant time. Without the variable set, this path is closed.
 * - A signed-in administrator holding `tl.devops.jobs.run`, for running a job
 *   by hand from the console.
 *
 * The route is registered `permissions: []` because the scheduler has no
 * session; the handler performs the authorization itself, before any job runs.
 */

import { z } from 'zod';
import { listJobs, runJobs } from '@/platform/jobs';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { can } from '@/platform/rbac';
import { safeEqual } from '@/platform/security/crypto';

export const dynamic = 'force-dynamic';

function authorizedByScheduler(request: Request): boolean {
  const secret = process.env.JOB_RUNNER_SECRET;
  if (!secret || secret.length < 32) return false;
  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  return presented.length > 0 && safeEqual(presented, secret);
}

export const GET = defineRoute({
  id: 'TL-API-JOBS-LIST-001',
  permissions: ['tl.devops.jobs.run'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: () => ({ jobs: listJobs() }),
});

export const POST = defineRoute({
  id: 'TL-API-JOBS-RUN-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'authenticated-standard',
  bodySchema: z.object({ jobs: z.array(z.string().max(64)).max(20).optional() }),
  audit: true,
  handler: async ({ request, principal, body }) => {
    if (!authorizedByScheduler(request) && !can(principal, 'tl.devops.jobs.run')) {
      throw principal.kind === 'anonymous' ? errors.unauthenticated() : errors.forbidden('tl.devops.jobs.run');
    }
    return { reports: await runJobs(body.jobs) };
  },
});
