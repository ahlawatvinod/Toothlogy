/**
 * TOOTHLOGY ERROR TRACKING PORT
 *
 * Founding spec §22. Exception aggregation, with one non-negotiable constraint:
 * a crash report must not become a data leak.
 *
 * Error trackers default to capturing request bodies, headers and local
 * variables — which for Toothlogy means session cookies, passwords mid-flight,
 * and clinical detail, shipped to a third party and retained there. So the port
 * accepts a deliberately narrow context, and `scrubContext` strips anything
 * sensitive before dispatch regardless of what a caller passed.
 *
 * 🟡 PREPARED. No adapter is registered.
 */

import { createProviderSlot } from '../integrations/provider';
import { redact } from './logger';

export interface ErrorContext {
  readonly requestId?: string;
  /** Pseudonymous user ID only — never an email, phone or name. */
  readonly userId?: string;
  readonly route?: string;
  readonly errorCode?: string;
  readonly tags?: Readonly<Record<string, string>>;
}

export interface ErrorTrackingPort {
  captureException(error: Error, context: ErrorContext): Promise<void>;
  captureMessage(message: string, level: 'warning' | 'error', context: ErrorContext): Promise<void>;
}

export const errorTrackingProvider = createProviderSlot<ErrorTrackingPort>('error tracking');

/**
 * Scrub context before it leaves the platform.
 *
 * Reuses the logger's redactor, so there is one definition of "sensitive" and
 * adding a field to that list protects logs and error reports together.
 */
export function scrubContext(context: ErrorContext): ErrorContext {
  return redact(context) as ErrorContext;
}

/**
 * Report an error without letting reporting break the request.
 *
 * An error tracker being down must not turn a handled 500 into an unhandled
 * one. Failures here are swallowed by design — the local structured log has
 * already recorded the original error.
 */
export async function reportError(error: Error, context: ErrorContext): Promise<void> {
  if (!errorTrackingProvider.isConfigured()) return;
  try {
    await errorTrackingProvider.get().captureException(error, scrubContext(context));
  } catch {
    // Intentionally ignored — see above.
  }
}
