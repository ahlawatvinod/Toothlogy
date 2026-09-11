/**
 * TOOTHLOGY BACKGROUND JOBS
 *
 * The work that must happen whether or not anyone is making a request:
 * publishing outbox events, retrying notifications, sending reminders,
 * expiring verifications, erasing accounts whose grace period ended.
 *
 * HOW JOBS RUN
 * Every job is an idempotent function safe to run from several processes at
 * once (each takes its rows with SKIP LOCKED or a conditional update). They are
 * invoked through `POST /api/v1/internal/jobs`, authenticated by
 * `JOB_RUNNER_SECRET`, which any scheduler can call: `npm run worker` locally,
 * a system cron, or a platform cron in production. Running them inside the
 * web process's request path would tie reminder delivery to traffic — the
 * quietest hour of the night is exactly when reminders for the morning are due.
 *
 * A job that throws is reported and does not stop the others.
 */

import { toAppError } from '../kernel/errors';
import { logger } from '../observability/logger';
import { relayOutbox } from '../events/outbox';
import { registerPlatformSubscribers } from '../events/subscribers';
import { processDueNotifications } from '../notifications';
import { expireLapsedVerifications } from '../verification/service';
import { processDueErasures } from '../auth/erasure';
import { pruneSessions } from '../auth/session';
import { pruneTokens } from '../auth/tokens';
import { databaseIdempotencyStore, databaseRateLimitStore } from '../db/stores';
import { purgeDeletedFiles } from '../storage/files';

export type JobFunction = () => Promise<unknown>;

export interface JobDefinition {
  readonly name: string;
  readonly description: string;
  readonly run: JobFunction;
}

const JOBS: JobDefinition[] = [
  {
    name: 'outbox.relay',
    description: 'Publish committed domain events to their durable handlers.',
    run: () => relayOutbox({ batchSize: 100 }),
  },
  {
    name: 'search.reindex',
    description:
      'Rebuild dentist and clinic search documents from the database, publishing only what is discoverable and withdrawing everything else.',
    // Lazy: the indexer pulls in clinic and dentist modules the other jobs do not need.
    run: async () => (await import('../discovery/indexer')).reindexAll(),
  },
  {
    name: 'appointments.expire',
    description: 'Lapse appointment requests and waitlist holds nobody answered, and close expired waitlist entries.',
    run: async () => (await import('../appointments/service')).expireStaleAppointments(),
  },
  {
    name: 'appointments.reminders',
    description: 'Send tomorrow, today and starting-soon reminders in the branch timezone, each claimed once per appointment time.',
    run: async () => (await import('../appointments/service')).sendDueReminders(),
  },
  {
    name: 'appointments.follow-ups',
    description: 'Send the follow-ups dentists recommended, once they fall due.',
    run: async () => (await import('../appointments/service')).sendDueFollowUps(),
  },
  {
    name: 'leads.follow-ups',
    description: 'Remind whoever is working a lead that its follow-up call is due, once per follow-up time.',
    run: async () => (await import('../leads/work')).sendDueLeadFollowUps(),
  },
  {
    name: 'marketplace.expire-quotes',
    description: 'Mark quotes whose validity has passed as expired, so they can no longer be accepted.',
    run: async () => (await import('../marketplace/service')).expireQuotes(),
  },
  {
    name: 'equipment.reminders',
    description: 'Remind practices 30 days before a warranty or maintenance contract ends (once per end date), and mark contracts past their end as ended.',
    run: async () => (await import('../equipment/service')).sendEquipmentReminders(),
  },
  {
    name: 'prime.renew',
    description: 'End Prime periods that are over, renewing each from the lead wallet once when renewal is on and the plan is still on sale.',
    run: async () => (await import('../prime/service')).renewMemberships(),
  },
  {
    name: 'careers.close-expired',
    description: 'Close job and internship postings whose closing date has passed.',
    run: async () => (await import('../careers/service')).closeExpiredPostings(),
  },
  {
    name: 'records.expire-grants',
    description: 'End dental-record grants whose time is up, and withdraw the consent each carried.',
    run: async () => (await import('../records/service')).expireGrants(),
  },
  {
    name: 'sponsored.accrue',
    description: 'Charge each running Prime campaign its day (once per day), and close campaigns whose dates or budget are done, refunding what was not spent.',
    run: async () => (await import('../sponsored/service')).accrueAllCampaigns(),
  },
  {
    name: 'billing.retry-pending-funds',
    description: 'Charge qualified leads that were waiting for wallet funds, oldest first.',
    run: async () => {
      const { db: database } = await import('../db/client');
      const { retryPendingFunds } = await import('../leads/service');
      const orgs = await database().lead.findMany({ where: { billingStatus: 'PENDING_FUNDS' }, select: { organizationId: true }, distinct: ['organizationId'] });
      let charged = 0;
      for (const o of orgs) charged += await retryPendingFunds(o.organizationId);
      return { organizations: orgs.length, charged };
    },
  },
  {
    name: 'billing.statements',
    description: 'Issue last month’s lead-wallet statement (once per wallet and month) for every wallet with charges or refunds in it.',
    run: async () => (await import('../billing/service')).issueMonthlyStatements(),
  },
  {
    name: 'notifications.process',
    description: 'Retry failed channels and send messages held for quiet hours.',
    run: () => processDueNotifications(100),
  },
  {
    name: 'verification.expire',
    description: 'Expire lapsed verifications and remove those dentists from search.',
    run: () => expireLapsedVerifications(),
  },
  {
    name: 'accounts.erase',
    description: 'Erase accounts whose deletion grace period has ended.',
    run: () => processDueErasures(),
  },
  {
    name: 'files.purge',
    description: 'Remove the bytes of deleted files whose retention period has passed.',
    run: () => purgeDeletedFiles(),
  },
  {
    name: 'maintenance.prune',
    description: 'Delete expired sessions, tokens, rate-limit windows and idempotency records.',
    run: async () => ({
      sessions: await pruneSessions(),
      tokens: await pruneTokens(),
      rateLimits: await databaseRateLimitStore.prune(),
      idempotency: await databaseIdempotencyStore.prune(),
    }),
  },
];

/** Later phases register their jobs (reminders, campaign pacing, …) here. */
export function registerJob(job: JobDefinition): void {
  if (!JOBS.some((j) => j.name === job.name)) JOBS.push(job);
}

export function listJobs(): ReadonlyArray<Pick<JobDefinition, 'name' | 'description'>> {
  return JOBS.map(({ name, description }) => ({ name, description }));
}

export interface JobReport {
  readonly name: string;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly result?: unknown;
  readonly error?: string;
}

export async function runJobs(names?: readonly string[]): Promise<JobReport[]> {
  registerPlatformSubscribers();

  const selected = names ? JOBS.filter((j) => names.includes(j.name)) : JOBS;
  const reports: JobReport[] = [];

  for (const job of selected) {
    const started = Date.now();
    try {
      const result = await job.run();
      reports.push({ name: job.name, ok: true, durationMs: Date.now() - started, result });
    } catch (error) {
      const appError = toAppError(error);
      logger.error('Job failed', { job: job.name, error: appError });
      reports.push({
        name: job.name,
        ok: false,
        durationMs: Date.now() - started,
        error: appError.code,
      });
    }
  }

  return reports;
}
