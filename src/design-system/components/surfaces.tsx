/**
 * TL-CMP-CARD-001 / TL-CMP-TABLE-001 — Structural surfaces
 */

import type { ReactNode, TableHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface CardProps {
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * Renders as a <section> with an accessible name. A page of unlabelled
   * <div>s gives a screen reader user no landmarks to navigate by; a named
   * section appears in their region list.
   */
  readonly label?: string;
}

export function Card({ children, className, label }: CardProps) {
  if (label) {
    return (
      <section className={cn('tl-card', className)} aria-label={label}>
        {children}
      </section>
    );
  }
  return <div className={cn('tl-card', className)}>{children}</div>;
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('tl-card__header', className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('tl-card__body', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('tl-card__footer', className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export interface TableProps extends Omit<TableHTMLAttributes<HTMLTableElement>, 'className'> {
  /**
   * Required. A table caption is how a screen reader user knows what the table
   * contains before reading 40 rows of it. Pass `visuallyHiddenCaption` to keep
   * it out of the visual design without removing it from the accessibility tree.
   */
  readonly caption: string;
  readonly visuallyHiddenCaption?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * The wrapper carries `overflow-x: auto`, `tabIndex={0}` and `role="region"`.
 *
 * Two problems solved at once: a wide table scrolls inside its own box so the
 * page body never scrolls sideways on mobile, and the scrollable area is
 * focusable so a keyboard user can actually reach the scrolled-off columns —
 * a scroll container that only responds to a mouse is inaccessible.
 */
export function Table({
  caption,
  visuallyHiddenCaption = false,
  children,
  className,
  ...rest
}: TableProps) {
  return (
    <div className="tl-table__scroll" tabIndex={0} role="region" aria-label={caption}>
      <table className={cn('tl-table', className)} {...rest}>
        <caption className={visuallyHiddenCaption ? 'tl-visually-hidden' : 'tl-table__caption'}>
          {caption}
        </caption>
        {children}
      </table>
    </div>
  );
}
