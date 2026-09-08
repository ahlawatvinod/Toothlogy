/**
 * TL-CMP-STATE-001 — Empty, loading and error states
 *
 * These are first-class components, not per-screen improvisations, because
 * EMPTY_STATES, LOADING_STATES and ERROR_STATES are three of the 21
 * certification dimensions (Constitution §7).
 *
 * Making them primitives changes what "done" means for every future screen: a
 * developer building a dentist list reaches for `EmptyState` and is immediately
 * confronted with the questions it requires — what should this say, and what
 * should the user do next? Left to per-screen improvisation, the empty case
 * renders as a blank panel and ships that way.
 */

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Spinner } from './feedback';

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

export interface EmptyStateProps {
  readonly title: string;
  /** What the user can do about it. Optional, but usually the whole point. */
  readonly description?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('tl-state', 'tl-state--empty', className)}>
      <p className="tl-state__title">{title}</p>
      {description ? <p className="tl-state__description">{description}</p> : null}
      {action ? <div className="tl-state__action">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export interface LoadingStateProps {
  readonly label?: string;
  readonly className?: string;
}

/**
 * `aria-live="polite"` announces loading once, without interrupting whatever
 * the user is currently reading.
 */
export function LoadingState({ label = 'Loading…', className }: LoadingStateProps) {
  return (
    <div className={cn('tl-state', 'tl-state--loading', className)} aria-live="polite">
      <Spinner label={label} />
      <p className="tl-state__description">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export interface ErrorStateProps {
  readonly title?: string;
  readonly description?: string;
  /**
   * Correlation ID from the failed response. Displayed so a user can quote it
   * to support, which turns "it broke" into an exact log line (founding spec §22).
   */
  readonly requestId?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'The page could not be loaded. Please try again.',
  requestId,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('tl-state', 'tl-state--error', className)} role="alert">
      <p className="tl-state__title">{title}</p>
      <p className="tl-state__description">{description}</p>
      {requestId ? (
        <p className="tl-state__meta">
          Reference: <code>{requestId}</code>
        </p>
      ) : null}
      {action ? <div className="tl-state__action">{action}</div> : null}
    </div>
  );
}
