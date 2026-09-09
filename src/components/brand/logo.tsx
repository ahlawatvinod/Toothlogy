/**
 * TL-CMP-LOGO-001 — Toothlogy logo
 *
 * The mark is inline SVG rather than an <img>, for three reasons that matter on
 * a header rendered on every page: it costs no extra request, it cannot flash in
 * after the text beside it, and its silver rim can pick up the theme rather than
 * staying a light-mode rim on a dark header.
 *
 * The same artwork is on disk at `public/brand/toothlogy-mark.svg`, which is
 * what `src/app/icon.svg` serves as the favicon, so tab, header and share card
 * are one identity.
 *
 * THE WORDMARK IS TEXT, NOT AN IMAGE
 * "toothlogy" is set in the product typeface at two weights, with the ™ as a
 * real character. That keeps it selectable, translatable, scalable with the
 * user's font-size setting, and readable to a screen reader — none of which a
 * flattened image gives — and it recolours correctly in dark mode.
 */

import { cn } from '@/design-system';

export interface LogoProps {
  /**
   * `full` is the icon plus wordmark lockup for the header and auth panels.
   * `mark` is the tile alone, for tight spaces.
   */
  readonly variant?: 'full' | 'mark';
  readonly className?: string;
}

/** The tile. `aria-hidden` because the wordmark beside it carries the name. */
export function LogoMark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn('tl-logo__mark', className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="tl-logo-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#17a094" />
          <stop offset="0.45" stopColor="#1c85a0" />
          <stop offset="1" stopColor="#2a6698" />
        </linearGradient>
        <linearGradient id="tl-logo-enamel" x1="0.25" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#f7fbfd" />
          <stop offset="1" stopColor="#dde9f0" />
        </linearGradient>
      </defs>

      <rect x="18" y="18" width="476" height="476" rx="116" fill="url(#tl-logo-tile)" />
      <rect
        x="35"
        y="35"
        width="442"
        height="442"
        rx="101"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="2.5"
      />
      {/* Dashed circles stand in for the dial ticks of the mark — the texture
          survives down to 24px, where 120 discrete ticks would turn to mud. */}
      <g fill="none" stroke="#ffffff" strokeLinecap="butt">
        <circle
          cx="256"
          cy="256"
          r="188"
          strokeOpacity="0.13"
          strokeWidth="26"
          strokeDasharray="2.2 12"
        />
        <circle cx="256" cy="256" r="205" strokeOpacity="0.1" strokeWidth="2" />
      </g>
      <path
        fill="url(#tl-logo-enamel)"
        d="M256 128c-42 0-74 22-78 64-3 28 5 54 12 80 9 34 15 68 18 92 2 14 8 22 16 22 9 0 14-9 16-24 4-36 9-60 16-60s12 24 16 60c2 15 7 24 16 24 8 0 14-8 16-22 3-24 9-58 18-92 7-26 15-52 12-80-4-42-36-64-78-64z"
      />
      <path
        fill="#ffffff"
        fillOpacity="0.9"
        d="M214 162c13-11 29-16 40-14 8 1 6 9-2 12-15 6-27 16-34 28-6 9-14 7-14-3 0-8 4-16 10-23z"
      />
      <path fill="#ffffff" d="M302 176l6 22 22 6-22 6-6 22-6-22-22-6 22-6z" />
    </svg>
  );
}

export function Logo({ variant = 'full', className }: LogoProps) {
  if (variant === 'mark') {
    return (
      <span className={cn('tl-logo tl-logo--mark', className)}>
        <LogoMark />
        {/* The mark alone still needs an accessible name where it stands in for
            the brand — otherwise the link wrapping it is announced unnamed. */}
        <span className="tl-visually-hidden">Toothlogy</span>
      </span>
    );
  }

  return (
    <span className={cn('tl-logo', className)}>
      <LogoMark />
      <span className="tl-logo__word">
        <span className="tl-logo__word-bold">tooth</span>
        <span className="tl-logo__word-light">logy</span>
        <span className="tl-logo__tm" aria-hidden="true">
          ™
        </span>
      </span>
    </span>
  );
}
