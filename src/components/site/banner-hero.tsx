/**
 * Banner-backed hero and promotional bands.
 *
 * Each of these renders `null` when its approved banner has not been
 * delivered, and the page falls back to what it already had. So the homepage
 * is correct with no banners, correct with all three, and correct with any
 * subset — which matters, because assets arrive one at a time.
 *
 * The overlay is HTML positioned over the image with a CSS scrim behind the
 * text. Nothing is composited into the file, and no crop is baked in: the
 * banner's own frame narrows on small screens and `object-position` chooses
 * what survives, rather than a second image being cut for mobile.
 */

import Link from 'next/link';
import { BannerImage } from '@/components/media/asset-image';
import { hasAsset } from '@/platform/media';
import { Reveal } from '@/components/motion/reveal';

/**
 * The homepage hero, backed by the approved clinic banner.
 *
 * `eager` because it is the largest thing above the fold; everything else on
 * the page loads lazily (specification §23).
 */
export function BannerHero({
  badge,
  title,
  lead,
  actions,
  note,
}: {
  readonly badge: string;
  readonly title: React.ReactNode;
  readonly lead: string;
  readonly actions: React.ReactNode;
  readonly note?: string;
}) {
  if (!hasAsset('banner-dental-hospital')) return null;

  return (
    <section className="tl-hero-banner" aria-labelledby="hero-heading">
      {/*
        * Copy on the left.
        *
        * This banner is symmetric — a clinician at each edge and the tooth in
        * the middle — so there is no empty quarter to write into. The left is
        * the least costly: the scrim sits over the male clinician, who reads
        * as atmosphere behind the text, while the central tooth and the second
        * clinician stay completely clear. Nothing is cropped out.
        */}
      <BannerImage slug="banner-dental-hospital" eager position="center" align="start">
        <p className="tl-hero__badge">
          <span className="tl-hero__badge-dot" aria-hidden="true" />
          {badge}
        </p>
        <h1 className="tl-hero__title tl-hero__title--on-banner" id="hero-heading">
          {title}
        </h1>
        <p className="tl-hero__lead tl-hero__lead--on-banner">{lead}</p>
        <div className="tl-hero__actions">{actions}</div>
        {note ? <p className="tl-hero__note tl-hero__note--on-banner">{note}</p> : null}
      </BannerImage>
    </section>
  );
}

/**
 * A full-width promotional band between sections.
 *
 * Deliberately carries no call to action of its own: it introduces the section
 * that follows it, and a second competing button beside the real ones is how a
 * page stops having a primary action.
 */
export function PromotionalBanner({
  slug,
  heading,
  lead,
}: {
  readonly slug: string;
  readonly heading: string;
  readonly lead: string;
}) {
  if (!hasAsset(slug)) return null;

  return (
    <Reveal as="section" className="tl-banner-band" aria-label={heading}>
      {/* Left: the treatment insets this banner exists to show sit centre and
          right, and the dental chair on the left is the part that can carry
          text without losing anything. */}
      <BannerImage slug={slug} position="center" align="start">
        <h2 className="tl-banner-band__title">{heading}</h2>
        <p className="tl-banner-band__lead">{lead}</p>
      </BannerImage>
    </Reveal>
  );
}

/**
 * The closing call to action, backed by the approved patient banner.
 *
 * Returns null when the banner is absent so the caller can fall back to the
 * gradient CTA it already has — both are complete designs, and neither is a
 * degraded version of the other.
 */
export function BannerCta({
  title,
  lead,
  primary,
  secondary,
}: {
  readonly title: string;
  readonly lead: string;
  readonly primary: { href: string; label: string };
  readonly secondary: { href: string; label: string };
}) {
  if (!hasAsset('banner-dental-cta')) return null;

  return (
    <section className="tl-banner-cta" aria-labelledby="cta-heading">
      {/*
        * Copy on the RIGHT, unlike the other two.
        *
        * The patient's face is on the left of this composition and is the
        * whole point of it — a smiling patient mid-treatment is what a closing
        * call to action is for. Writing over her would throw that away, so the
        * text goes over the clinic interior on the right instead.
        */}
      <BannerImage slug="banner-dental-cta" position="center" align="end">
        <h2 className="tl-cta__title" id="cta-heading">
          {title}
        </h2>
        <p className="tl-cta__lead tl-cta__lead--on-banner">{lead}</p>
        <div className="tl-cta__actions tl-cta__actions--start">
          <Link className="tl-button tl-button--on-brand tl-button--lg" href={primary.href}>
            {primary.label}
          </Link>
          <Link
            className="tl-button tl-button--on-brand-ghost tl-button--lg"
            href={secondary.href}
          >
            {secondary.label}
          </Link>
        </div>
      </BannerImage>
    </section>
  );
}
