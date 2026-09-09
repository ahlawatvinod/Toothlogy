/**
 * Protective and preventive dentistry.
 *
 * The custom appliances a patient wears to prevent damage rather than repair
 * it — a sports mouthguard, a night guard. Both are real entries in the
 * treatment catalogue, so the cards link into it rather than to a page written
 * for the pictures.
 *
 * Renders only the cards whose approved photograph exists, and the whole
 * section disappears when neither does. A "protective dentistry" section with
 * no imagery is just two more text tiles among the twelve already above it.
 */

import Link from 'next/link';
import { ServiceImage } from '@/components/media/asset-image';
import { hasAsset } from '@/platform/media';
import { Reveal } from '@/components/motion/reveal';
import { SectionHeading } from './sections';

const CARDS = [
  {
    slug: 'sports-mouthguard',
    serviceSlug: 'sports-mouthguard',
    title: 'Sports mouthguards',
    text: 'A custom-fitted guard worn during contact sport, to reduce the risk of injury to the teeth, lips and jaw. Made to your own impressions, so it stays put.',
  },
  {
    slug: 'night-guard',
    serviceSlug: 'night-guard',
    title: 'Night guards',
    text: 'Worn overnight if you grind or clench, to protect the teeth and ease strain on the jaw joints and muscles.',
  },
] as const;

export function ProtectiveCare() {
  const available = CARDS.filter((card) => hasAsset(card.slug));
  if (available.length === 0) return null;

  return (
    <section className="tl-section" aria-labelledby="protective-heading">
      <div className="tl-container">
        <Reveal>
          <SectionHeading
            id="protective-heading"
            eyebrow="Protective & preventive dentistry"
            title="Appliances made to protect, not repair"
            lead="Custom-made guards are fitted from your own impressions or a digital scan. Both are in the treatment catalogue, with the price range each usually falls in."
          />
        </Reveal>

        <ul className="tl-tiles tl-tiles--wide">
          {available.map((card, index) => (
            <Reveal as="li" key={card.slug} delay={index * 110}>
              <article className="tl-tile tl-tile--link">
                <ServiceImage
                  slug={card.slug}
                  className="tl-tile__media"
                  sizes="(max-width: 40rem) 100vw, 30rem"
                />
                <h3 className="tl-tile__title">
                  {/* The whole card is the hit area; the accessible name stays
                      on the anchor. */}
                  <Link className="tl-tile__link" href="/find">
                    {card.title}
                  </Link>
                </h3>
                <p className="tl-tile__text">{card.text}</p>
                <span className="tl-tile__foot" aria-hidden="true">
                  Find a dentist
                </span>
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
