/**
 * TL-CMP-DIALOG-001 — Modal dialog
 *
 * Built on the native `<dialog>` element with `showModal()`, which gives —
 * from the platform, correctly, for free — focus trapping, Escape to close,
 * inert background content, and top-layer rendering above any z-index.
 *
 * Hand-rolled modals get all four of those wrong in ways that matter: focus
 * escapes to the page behind, Escape does nothing, and a screen reader reads
 * the obscured page as though it were still available. Any of those makes the
 * dialog unusable without a mouse.
 *
 * What still needs implementing here is focus *restoration* — returning focus
 * to the element that opened the dialog. Browsers do not guarantee it, and
 * without it a keyboard user is dropped at the top of the document on close.
 */

'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
}

export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      // Return focus where the user left it.
      previouslyFocused.current?.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cn('tl-dialog', className)}
      aria-labelledby="tl-dialog-title"
      // Fires on Escape as well as close(); routed through onClose so React
      // state cannot drift out of sync with the DOM's open state.
      onClose={onClose}
      // The ::backdrop pseudo-element is not clickable, so dismiss-on-outside-
      // click is detected by comparing the click target to the dialog itself.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="tl-dialog__panel">
        <div className="tl-dialog__header">
          <h2 className="tl-dialog__title" id="tl-dialog-title">
            {title}
          </h2>
          <button
            type="button"
            className="tl-dialog__close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <div className="tl-dialog__body">{children}</div>

        {footer ? <div className="tl-dialog__footer">{footer}</div> : null}
      </div>
    </dialog>
  );
}
