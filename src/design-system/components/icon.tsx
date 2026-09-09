/**
 * TL-CMP-ICON-001 — Icon
 *
 * One stroked, 24×24, 1.75-weight icon set for the whole product.
 *
 * WHY A LOCAL SET RATHER THAN AN ICON PACKAGE
 * The product needs about twenty icons. A package would ship a few thousand,
 * add a dependency to a health platform's supply chain for artwork, and — the
 * part that actually bites — leave the door open to a second package later,
 * after which half the icons are stroked and half are filled and the interface
 * stops looking designed. Constitution P7 puts the design system in platform
 * ownership for exactly this reason.
 *
 * Every glyph here is drawn on the same grid with the same stroke weight, joins
 * and caps, so they sit together at any size.
 *
 * ACCESSIBILITY
 * Icons are `aria-hidden` by default: almost every one sits beside a text label
 * that already names the thing, and a duplicate announcement is noise. Passing
 * a `title` makes it a labelled `img` instead — for the rare icon that is the
 * only content of its control.
 */

import type { SVGProps } from 'react';
import { cn } from '../lib/cn';

/** Path data only, so a glyph cannot bring its own stroke width or colour. */
const PATHS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4.1-4.1',
  shieldCheck: 'M12 3 5 6v5.5c0 4.2 2.9 7.6 7 8.5 4.1-.9 7-4.3 7-8.5V6l-7-3ZM9 12l2.2 2.2L15.5 10',
  calendarCheck:
    'M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM9 14l2 2 4-4',
  mapPin: 'M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  lock: 'M7 10V7.5a5 5 0 0 1 10 0V10M6 10h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1ZM12 14.5v2',
  users:
    'M15.5 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.9a3.4 3.4 0 0 0-3.4 3.4V20M9.5 11.6a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6ZM20.5 20v-1.6a3.4 3.4 0 0 0-2.5-3.3M15.5 5.2a3.3 3.3 0 0 1 0 6.4',
  building:
    'M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M3 21h18M7.5 8h3M7.5 12h3M7.5 16h3M18 14h.01M18 17.5h.01',
  bookOpen: 'M12 6.5C10.5 5.2 8.6 4.5 6 4.5H3v13h3c2.6 0 4.5.7 6 2M12 6.5c1.5-1.3 3.4-2 6-2h3v13h-3c-2.6 0-4.5.7-6 2M12 6.5v13',
  messageCircle: 'M20 11.5a7.6 7.6 0 0 1-8 7.5 8.6 8.6 0 0 1-3.4-.7L4 20l1.4-3.9A7.4 7.4 0 0 1 4 11.5 7.6 7.6 0 0 1 12 4a7.6 7.6 0 0 1 8 7.5Z',
  graduationCap: 'M12 4 2.5 9 12 14l9.5-5L12 4ZM6.5 11.2V16c0 1.3 2.5 2.6 5.5 2.6s5.5-1.3 5.5-2.6v-4.8M21 9.5v5',
  sparkles: 'M12 3.5 13.6 8l4.4 1.6L13.6 11 12 15.5 10.4 11 6 9.6 10.4 8 12 3.5ZM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM5 13l.6 1.6 1.6.6-1.6.6L5 17.4l-.6-1.6-1.6-.6 1.6-.6L5 13Z',
  arrowRight: 'M4.5 12h15M13.5 6l6 6-6 6',
  tooth: 'M12 3.5c-3.2 0-5.6 1.7-6 5-.3 2.2.4 4.2 1 6.2.7 2.7 1.1 5.3 1.4 7.1.1 1.1.6 1.7 1.2 1.7.7 0 1.1-.7 1.2-1.9.3-2.8.7-4.6 1.2-4.6s.9 1.8 1.2 4.6c.2 1.2.6 1.9 1.2 1.9.7 0 1.1-.6 1.2-1.7.3-1.8.7-4.4 1.4-7.1.6-2 1.3-4 1-6.2-.4-3.3-2.8-5-6-5Z',
  globe: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM3.5 12h17M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5S14.2 18.2 12 20.5C9.8 18.2 8.6 15.2 8.6 12S9.8 5.8 12 3.5Z',
  clipboardCheck:
    'M9 4.5h6M9.5 3h5a1 1 0 0 1 1 1v1.5h-7V4a1 1 0 0 1 1-1ZM8.5 5.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5a2 2 0 0 0-2-2h-1.5M9 13.5l2 2 4-4',
  heartPulse:
    'M12 20s-7.5-4.4-7.5-9.4A4.1 4.1 0 0 1 12 7.8a4.1 4.1 0 0 1 7.5 2.8c0 5-7.5 9.4-7.5 9.4ZM3.5 13h3l1.5-2.5 2 5 2-3.5 1.2 1h4.3',
  scale: 'M12 4v16M7 20h10M6 8h12M6 8 3.5 14h5L6 8ZM18 8l-2.5 6h5L18 8ZM9 4.6 12 4l3 .6',
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'className'> {
  readonly name: IconName;
  /**
   * Supplying a title turns the icon into a labelled image. Leave it off when
   * adjacent text already names the thing — the default.
   */
  readonly title?: string;
  readonly className?: string;
}

export function Icon({ name, title, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('tl-icon', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}
