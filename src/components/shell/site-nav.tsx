'use client';

/**
 * Public site navigation — the interactive half of the header.
 *
 * WHY THIS IS SPLIT FROM SiteHeader
 * `SiteHeader` is a server component so the signed-in state is resolved before
 * the page is sent; rendering a signed-out header and correcting it after
 * hydration would flash "Sign in" at an authenticated user. But scroll state,
 * the mobile menu and the active-route indicator all need the client. So the
 * server component resolves the session and passes the finished action buttons
 * down as `children`-style props: this file adds behaviour without ever
 * learning who is signed in, and the session still never round-trips to the
 * client to decide what to render.
 *
 * ACCESSIBILITY DECISIONS
 * - The toggle is a real <button> with `aria-expanded` and `aria-controls`.
 * - The menu closes on Escape and on route change, and focus returns to the
 *   toggle — otherwise a keyboard user who dismisses the menu is left with
 *   focus on a hidden element.
 * - The current page carries `aria-current="page"`, which is what a screen
 *   reader announces; the underline is the visual half of the same signal.
 * - Background scroll is locked while the menu is open, so the page behind it
 *   does not move under the panel.
 */

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface NavLink {
  readonly href: string;
  readonly label: string;
}

export interface SiteNavProps {
  readonly links: readonly NavLink[];
  /** Header-bar actions, rendered by the server component that knows the session. */
  readonly actions: ReactNode;
  /** The same actions laid out for the mobile panel, where they stack full-width. */
  readonly menuActions: ReactNode;
  /** Theme toggle and anything else that belongs at the foot of the mobile panel. */
  readonly menuMeta?: ReactNode;
  readonly brand: ReactNode;
}

/**
 * True once the page has scrolled past the point where a transparent header
 * would start overlapping content rather than the hero.
 */
function useScrolled(threshold = 12): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update(); // A restored scroll position must not start in the wrong state.
    // `passive` keeps the listener off the scroll critical path.
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [threshold]);

  return scrolled;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  // Marks the parent nav item for nested routes, so /dentists/priya still
  // highlights "Find a dentist" rather than nothing at all.
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav({ links, actions, menuActions, menuMeta, brand }: SiteNavProps) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const scrolled = useScrolled();
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  /*
   * The menu's open state is stored as *the path it was opened on*, not as a
   * boolean.
   *
   * Navigating with the menu open has to close it, or the panel stays over the
   * page the visitor just asked for. Deriving `open` this way makes that
   * automatic: the moment `pathname` changes the comparison fails and the menu
   * is closed, with no effect, no extra render pass, and no window in which the
   * new page is behind a stale panel.
   */
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = (next: boolean) => setOpenPath(next ? pathname : null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // `setOpenPath` rather than the `setOpen` helper: the setter returned by
      // useState is stable, so the effect does not need to re-subscribe on
      // every render just to close a menu.
      setOpenPath(null);
      // Focus has to come back to the toggle, or a keyboard user who dismisses
      // the menu is left with focus on an element that no longer exists.
      toggleRef.current?.focus();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <header className="tl-header" data-scrolled={scrolled} data-menu-open={open}>
      {/*
       * Step 1 of the hero entrance: the bar drops in before anything under
       * it moves. It runs on mount, so it plays once per full page load
       * rather than on every client-side navigation.
       */}
      <motion.div
        className="tl-container tl-container--wide tl-header__inner"
        initial={reduceMotion ? false : { opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
      >
        {brand}

        {/*
         * A real <nav> with an accessible name. A screen-reader user can jump
         * straight to it, and with several nav landmarks on a page the name is
         * what distinguishes them.
         */}
        <nav className="tl-header__nav" aria-label="Main">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(pathname, link.href) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="tl-header__actions">{actions}</div>

        <button
          ref={toggleRef}
          type="button"
          className="tl-header__toggle"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(!open)}
        >
          <span className="tl-header__toggle-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </motion.div>

      {/*
       * Rendered only while open rather than hidden with CSS, so its links never
       * sit in the tab order of a page whose menu is closed.
       */}
      {open ? (
        <div className="tl-container">
          <nav className="tl-header__menu" id={menuId} aria-label="Main">
            {links.map((link, index) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(pathname, link.href) ? 'page' : undefined}
                style={{ '--tl-menu-index': index } as React.CSSProperties}
              >
                {link.label}
              </Link>
            ))}

            <div
              className="tl-header__menu-actions"
              style={{ '--tl-menu-index': links.length } as React.CSSProperties}
            >
              {menuActions}
            </div>

            {menuMeta ? (
              <div
                className="tl-header__menu-meta"
                style={{ '--tl-menu-index': links.length + 1 } as React.CSSProperties}
              >
                {menuMeta}
              </div>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
