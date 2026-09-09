/**
 * Public-site section primitives.
 *
 * Small, presentational, and shared between the home page and the marketing
 * pages, so a heading on `/about` sits on the same baseline as one on `/`.
 * They are server components and hold no state — everything that needs the
 * client is composed around them by `Reveal`.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, cn, type IconName } from '@/design-system';

/* -------------------------------------------------------------------------
 * Section heading
 * ------------------------------------------------------------------------- */

export interface SectionHeadingProps {
  readonly eyebrow?: string;
  readonly title: ReactNode;
  readonly lead?: ReactNode;
  readonly align?: 'start' | 'center';
  /**
   * Required. It is wired to the section's `aria-labelledby`, which is what
   * gives a screen-reader user a list of sections to navigate by instead of an
   * undifferentiated wall of regions.
   */
  readonly id: string;
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'start',
  id,
}: SectionHeadingProps) {
  return (
    <div className={cn('tl-section__head', align === 'center' && 'tl-section__head--center')}>
      {eyebrow ? <p className="tl-eyebrow">{eyebrow}</p> : null}
      <h2 className="tl-section__title" id={id}>
        {title}
      </h2>
      {lead ? <p className="tl-section__lead">{lead}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Tile
 * ------------------------------------------------------------------------- */

export interface TileProps {
  readonly icon: IconName;
  readonly title: string;
  readonly text: string;
  /**
   * When present the whole tile becomes one link, via a stretched pseudo-element
   * on the anchor. When absent the tile is static and gets no hover lift — a
   * card that rises under the pointer and then does nothing when clicked is a
   * promise the interface cannot keep.
   */
  readonly href?: string;
  readonly cta?: string;
}

export function Tile({ icon, title, text, href, cta }: TileProps) {
  const body = (
    <>
      <span className="tl-tile__icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <h3 className="tl-tile__title">
        {href ? (
          <Link className="tl-tile__link" href={href}>
            {title}
          </Link>
        ) : (
          title
        )}
      </h3>
      <p className="tl-tile__text">{text}</p>
      {href && cta ? (
        <span className="tl-tile__foot" aria-hidden="true">
          {cta}
          <Icon name="arrowRight" className="tl-tile__arrow" />
        </span>
      ) : null}
    </>
  );

  return <div className={cn('tl-tile', href && 'tl-tile--link')}>{body}</div>;
}

/* -------------------------------------------------------------------------
 * Feature row
 * ------------------------------------------------------------------------- */

export function Feature({
  icon,
  title,
  text,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly text: string;
}) {
  return (
    <div className="tl-feature">
      <span className="tl-feature__icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div>
        <h3 className="tl-feature__title">{title}</h3>
        <p className="tl-feature__text">{text}</p>
      </div>
    </div>
  );
}
