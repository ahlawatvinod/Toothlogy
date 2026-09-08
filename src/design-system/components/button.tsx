/**
 * TL-CMP-BUTTON-001 — Button
 *
 * Accessibility decisions that are easy to get wrong and expensive to fix later:
 *
 * - **A busy button is `aria-busy`, not `disabled`.** A `disabled` element is
 *   removed from the tab order, so a keyboard user's focus is silently thrown
 *   to the top of the document the moment they submit a form. Keeping it
 *   focusable and blocking the click preserves focus and still prevents the
 *   double submit.
 * - **The loading state keeps the label.** Replacing text with a spinner
 *   destroys the accessible name mid-action; a screen reader user who tabs back
 *   finds an unnamed button.
 * - **Minimum 44px touch target** via `--tl-touch-target`, below which taps
 *   start missing on real devices.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Shows a spinner and blocks activation, without removing focusability. */
  readonly loading?: boolean;
  readonly fullWidth?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'tl-button--primary',
  secondary: 'tl-button--secondary',
  ghost: 'tl-button--ghost',
  danger: 'tl-button--danger',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'tl-button--sm',
  md: 'tl-button--md',
  lg: 'tl-button--lg',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled = false,
  type = 'button',
  children,
  className,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      // Only a genuinely disabled button leaves the tab order. A busy one stays.
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={cn(
        'tl-button',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'tl-button--full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="tl-button__spinner" aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
