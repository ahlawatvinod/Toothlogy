/**
 * TL-CMP-BADGE-001 / TL-CMP-ALERT-001 / TL-CMP-SPINNER-001 / TL-CMP-SKELETON-001
 *
 * Status, feedback and loading primitives.
 *
 * The rule shared by all of them: **colour is never the only signal.** A badge
 * carries text, an alert carries a text prefix naming its severity, and a
 * spinner carries an accessible label. Around 8% of men have some colour-vision
 * deficiency, and for them a red badge and a green badge are the same badge.
 */

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return <span className={cn('tl-badge', `tl-badge--${tone}`, className)}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  readonly tone?: AlertTone;
  readonly title?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Severity words are rendered visually hidden, so assistive technology conveys
 * what the colour conveys to a sighted user.
 */
const TONE_LABEL: Record<AlertTone, string> = {
  info: 'Information:',
  success: 'Success:',
  warning: 'Warning:',
  danger: 'Error:',
};

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  // Errors and warnings interrupt; info and success wait their turn. Making
  // everything assertive trains users to ignore announcements entirely.
  const assertive = tone === 'danger' || tone === 'warning';

  return (
    <div
      className={cn('tl-alert', `tl-alert--${tone}`, className)}
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
    >
      <span className="tl-visually-hidden">{TONE_LABEL[tone]}</span>
      <div className="tl-alert__content">
        {title ? <p className="tl-alert__title">{title}</p> : null}
        <div className="tl-alert__body">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

export interface SpinnerProps {
  /** Accessible label. Defaults to "Loading". */
  readonly label?: string;
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}

export function Spinner({ label = 'Loading', size = 'md', className }: SpinnerProps) {
  return (
    <span className={cn('tl-spinner', `tl-spinner--${size}`, className)} role="status">
      <span className="tl-spinner__ring" aria-hidden="true" />
      <span className="tl-visually-hidden">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export interface SkeletonProps {
  readonly width?: string;
  readonly height?: string;
  readonly className?: string;
}

/**
 * Skeletons are decorative and hidden from assistive technology.
 *
 * A screen reader announcing eight grey rectangles is noise. The surrounding
 * `LoadingState` announces "loading" once, which is the useful information.
 */
export function Skeleton({ width = '100%', height = '1rem', className }: SkeletonProps) {
  return (
    <span
      className={cn('tl-skeleton', className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
