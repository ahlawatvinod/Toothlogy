/**
 * TOOTHLOGY HEALTH & READINESS
 *
 * Founding spec §22. Two questions with different answers and different
 * consumers:
 *
 * - **Liveness** — is the process alive? A failing liveness check should cause a
 *   restart.
 * - **Readiness** — can it serve traffic *right now*? A failing readiness check
 *   should remove the instance from the load balancer without restarting it.
 *
 * Conflating them causes a specific outage: if a database blip fails the
 * liveness check, the orchestrator restarts every instance simultaneously,
 * turning a brief dependency wobble into a full outage with a cold start. So a
 * dependency being down makes this service *not ready*, never *not alive*.
 *
 * Detail is permission-gated (`tl.devops.health.read`). Dependency names,
 * versions and failure messages are useful to an operator and equally useful to
 * an attacker mapping the system.
 */

import { hasDatabase } from '../config';
import { emailProvider, pushProvider, smsProvider } from '../notifications/ports';
import { paymentProvider } from '../payments/ports';
import { searchProvider } from '../search/ports';
import { storageProvider } from '../storage/ports';
import { ensureStorageConfigured } from '../storage/files';
import { ensureSearchConfigured } from '../search/service';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DependencyHealth {
  readonly name: string;
  readonly status: HealthStatus;
  /**
   * A dependency that is not required for the platform to serve traffic.
   * An unconfigured SMS provider is degraded, not unhealthy — patients can
   * still browse, and pretending otherwise would take the site down for a
   * missing API key.
   */
  readonly required: boolean;
  readonly detail?: string;
}

export interface HealthReport {
  readonly status: HealthStatus;
  readonly checkedAt: string;
  readonly dependencies?: readonly DependencyHealth[];
}

/**
 * Provider slots report configuration, not reachability.
 *
 * Checking reachability would mean calling a third party on every health probe —
 * turning a load balancer's health check into sustained traffic against a
 * vendor, and making our availability depend on theirs during the very check
 * meant to protect us. Reachability belongs in periodic background monitoring.
 */
function checkDependencies(): DependencyHealth[] {
  return [
    {
      name: 'database',
      required: true,
      status: hasDatabase() ? 'healthy' : 'unhealthy',
      detail: hasDatabase() ? undefined : 'DATABASE_URL is not configured',
    },
    {
      name: 'storage',
      required: false,
      status: storageProvider.isConfigured() ? 'healthy' : 'degraded',
      detail: storageProvider.isConfigured() ? undefined : 'No storage adapter registered',
    },
    {
      name: 'email',
      required: false,
      status: emailProvider.isConfigured() ? 'healthy' : 'degraded',
      detail: emailProvider.isConfigured() ? undefined : 'No email adapter registered',
    },
    {
      name: 'sms',
      required: false,
      status: smsProvider.isConfigured() ? 'healthy' : 'degraded',
      detail: smsProvider.isConfigured() ? undefined : 'No SMS adapter registered',
    },
    {
      name: 'push',
      required: false,
      status: pushProvider.isConfigured() ? 'healthy' : 'degraded',
      detail: pushProvider.isConfigured() ? undefined : 'No push adapter registered',
    },
    {
      name: 'payments',
      required: false,
      status: paymentProvider.isConfigured() ? 'healthy' : 'degraded',
      detail: paymentProvider.isConfigured() ? undefined : 'No payment adapter registered',
    },
    {
      name: 'search',
      required: false,
      status: searchProvider.isConfigured() ? 'healthy' : 'degraded',
      detail: searchProvider.isConfigured() ? undefined : 'No search adapter registered',
    },
  ];
}

/** Roll dependency states into one status. Only a *required* failure is unhealthy. */
function aggregate(dependencies: readonly DependencyHealth[]): HealthStatus {
  if (dependencies.some((d) => d.required && d.status === 'unhealthy')) return 'unhealthy';
  if (dependencies.some((d) => d.status !== 'healthy')) return 'degraded';
  return 'healthy';
}

/**
 * Build a health report.
 *
 * `includeDetail` is decided by the caller's permission, so the same function
 * serves both the public probe and the operator view without two code paths
 * that could disagree.
 */
export function getHealthReport(includeDetail: boolean): HealthReport {
  // Storage and search adapters are installed lazily on first use. Install any
  // that are configured before reporting, so health describes configuration
  // rather than whether a file or search request happened to run first.
  ensureStorageConfigured();
  ensureSearchConfigured();
  const dependencies = checkDependencies();
  return {
    status: aggregate(dependencies),
    checkedAt: new Date().toISOString(),
    ...(includeDetail ? { dependencies } : {}),
  };
}

/**
 * Liveness only. Deliberately checks nothing external: if this code runs, the
 * process is alive, and that is the entire question.
 */
export function isAlive(): boolean {
  return true;
}
