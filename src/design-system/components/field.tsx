/**
 * TL-CMP-FIELD-001 / TL-CMP-INPUT-001 — Form field and input
 *
 * The single most common accessibility failure in forms is an error message
 * that is visible but not *associated*: a screen reader user hears "Email,
 * edit text" and never learns why the form was rejected.
 *
 * `Field` makes the association structural rather than optional:
 *
 * - the label's `htmlFor` and the control's `id` are wired from one generated ID
 * - hint and error are linked through `aria-describedby`
 * - an error sets `aria-invalid`, so the state is announced, not merely red
 * - the error is a live region, so it is read when it appears after submission
 *
 * Because `Field` owns the ID, a caller cannot forget to connect them.
 */

'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface FieldProps {
  readonly label: string;
  /** Helper text shown before, and alongside, any error. */
  readonly hint?: string;
  /** Error message. Presence switches the field into its invalid state. */
  readonly error?: string;
  readonly required?: boolean;
  /** Receives the wiring: id, aria-describedby, aria-invalid, required. */
  readonly children: (props: FieldControlProps) => ReactNode;
  readonly className?: string;
}

export interface FieldControlProps {
  readonly id: string;
  readonly 'aria-describedby': string | undefined;
  readonly 'aria-invalid': boolean | undefined;
  readonly required: boolean | undefined;
}

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  // Both are referenced when both exist, so the user hears the guidance and the
  // problem rather than only the most recent one.
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cn('tl-field', error && 'tl-field--invalid', className)}>
      <label className="tl-field__label" htmlFor={id}>
        {label}
        {required ? (
          <>
            {' '}
            <span className="tl-field__required" aria-hidden="true">
              *
            </span>
            <span className="tl-visually-hidden">(required)</span>
          </>
        ) : null}
      </label>

      {hint ? (
        <p className="tl-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}

      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
        required: required || undefined,
      })}

      {/*
       * role="alert" so an error appearing after submission is announced
       * immediately. A silently added error leaves a screen reader user waiting
       * for a form that already failed.
       */}
      {error ? (
        <p className="tl-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  readonly className?: string;
}

export function Input({ className, ...rest }: InputProps) {
  return <input className={cn('tl-input', className)} {...rest} />;
}
