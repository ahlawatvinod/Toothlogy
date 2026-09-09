/**
 * Approved-banner sections: hero, promotional split, and the closing call to
 * action.
 *
 * NO TEXT SITS ON TOP OF A PHOTOGRAPH HERE.
 *
 * An earlier version overlaid the copy with a darkening scrim. It read well
 * over a flat gradient and would have been wrong over the real artwork: these
 * compositions are full-bleed and busy — a clinician at each edge of the hero
 * banner, a patient's face filling the left of the CTA banner — so any overlay
 * is written across something the image exists to show, and the scrim dims a
 * clinical photograph that was lit deliberately.
 *
 * Putting the copy BESIDE the image instead removes the problem rather than
 * tuning it: nothing is covered, nothing is dimmed, no crop is implied, and
 * the image is shown whole. It is also what §2, §5 and §11 of the brief ask
 * for.
 *
 * Every section renders `null` until its approved file is present, so the page
 * is correct with none of them, all of them, or any subset.
 */

import Link from 'next/link';
import NextImage from 'next/image';
import { resolveAsset } from '@/platform/media';
import { cn } from '@/design-system';
import { Reveal } from '@/components/motion/reveal';

/**
 * The approved image presented as a card.
 *
 * Rounded, bordered, lifted — the "premium visual card rather than a random
 * image inserted into the page" the brief asks for. The frame is styled; the
 * file is not touched.
 */
function ImageCard({
  slug,
  eager = false,
  sizes,
  className,
}: {
  readonly slug: string;
  readonly eager?: boolean;
  readonly sizes: string;
  readonly className?: string;
}) {
  const asset = resolveAsset(slug);
  if (!asset) return null;

  return (
    <figure className={cn('tl-imagecard', className)}>
      <NextImage
        src={asset.src}
        alt={asset.alt}
        width={asset.width}
        height={asset.height}
        sizes={sizes}
        loading={eager ? 'eager' : 'lazy'}
        preload={eager}
        className="tl-imagecard__img"
      />
    </figure>
  );
}

/**
 * Homepage hero: copy left, approved banner right.
 *
 * Returns null when the banner is absent, and the page keeps the illustrated
 * gradient hero it already has. Both are complete designs carrying identical
 * headline, copy and calls to action.
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
  if (!resolveAsset('banner-dental-hospital')) return null;

  return (
    <section className="tl-hero tl-hero--split" aria-labelledby="hero-heading">
      <div className="tl-container tl-hero__inner">
        {/*
         * Staggered entrance. Each element carries its own delay so the
         * headline settles before the paragraph, which settles before the
         * buttons — the order the eye reads them in. `Reveal` puts the whole
         * thing behind `prefers-reduced-motion` and behind a scripting check.
         */}
        <div className="tl-hero__copy">
          <Reveal><p className="tl-hero__badge">
            <span className="tl-hero__badge-dot" aria-hidden="true" />
            {badge}
          </p></Reveal>

          <Reveal delay={80}>
            <h1 className="tl-hero__title" id="hero-heading">{title}</h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="tl-hero__lead">{lead}</p>
          </Reveal>

          <Reveal delay={240} className="tl-hero__actions">{actions}</Reveal>

          {note ? (
            <Reveal delay={320}><p className="tl-hero__note">{note}</p></Reveal>
          ) : null}
        </div>

        <Reveal variant="scale" delay={200} className="tl-hero__figure">
          <ImageCard
            slug="banner-dental-hospital"
            eager
            sizes="(max-width: 64rem) 100vw, 56vw"
          />
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Promotional split: content one side, approved banner the other.
 *
 * Roughly 45/55 in the content's favour on desktop, and content-first when it
 * stacks, so the reader gets the point before the picture.
 */
export function PromotionalBanner({
  slug,
  eyebrow,
  heading,
  lead,
  cta,
}: {
  readonly slug: string;
  readonly eyebrow: string;
  readonly heading: string;
  readonly lead: string;
  readonly cta?: { href: string; label: string };
}) {
  if (!resolveAsset(slug)) return null;

  return (
    <section className="tl-section tl-section--soft" aria-labelledby="promo-heading">
      <div className="tl-container tl-promo">
        <Reveal className="tl-promo__body">
          <p className="tl-eyebrow">{eyebrow}</p>
          <h2 className="tl-section__title" id="promo-heading">{heading}</h2>
          <p className="tl-section__lead">{lead}</p>
          {cta ? (
            <Link className="tl-button tl-button--primary tl-button--md" href={cta.href}>
              {cta.label}
            </Link>
          ) : null}
        </Reveal>

        <Reveal variant="scale" delay={120}>
          <ImageCard slug={slug} sizes="(max-width: 64rem) 100vw, 55vw" />
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Closing call to action: copy left, approved banner right.
 *
 * A split rather than a stack, so the patient banner sits beside the buttons
 * at the same optical weight instead of below them — and, as everywhere else
 * here, no copy is written across the photograph.
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
  if (!resolveAsset('banner-dental-cta')) return null;

  return (
    <section className="tl-section" aria-labelledby="cta-heading">
      <div className="tl-container">
        <Reveal variant="scale" className="tl-cta tl-cta--split">
          <div className="tl-cta__body">
            <Reveal>
              <h2 className="tl-cta__title" id="cta-heading">{title}</h2>
            </Reveal>
            <Reveal delay={90}><p className="tl-cta__lead">{lead}</p></Reveal>
            <Reveal delay={180} className="tl-cta__actions">
              <Link className="tl-button tl-button--on-brand tl-button--lg" href={primary.href}>
                {primary.label}
              </Link>
              <Link
                className="tl-button tl-button--on-brand-ghost tl-button--lg"
                href={secondary.href}
              >
                {secondary.label}
              </Link>
            </Reveal>
          </div>

          <Reveal variant="scale" delay={260}>
            <ImageCard slug="banner-dental-cta" sizes="(max-width: 64rem) 100vw, 34rem" />
          </Reveal>
        </Reveal>
      </div>
    </section>
  );
}
