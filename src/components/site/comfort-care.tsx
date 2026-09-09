/**
 * Comfort and special care.
 *
 * Sedation, and dentistry adapted to a disability or medical condition. Both
 * are real entries in the treatment catalogue, so the cards link into it
 * rather than to a page written around the photographs.
 *
 * Only cards whose approved photograph exists are rendered, and the section
 * disappears when none do — these two treatments are already listed among the
 * specialties above, so a picture-less version of this section would just
 * repeat them.
 */

import Link from 'next/link';
import { ServiceImage } from '@/components/media/asset-image';
import { hasAsset } from '@/platform/media';
import { Reveal } from '@/components/motion/reveal';
import { SectionHeading } from './sections';

const CARDS = [
  {
    slug: 'iv-sedation',
    title: 'Sedation dentistry',
    text: 'Sedative medication given through a vein, producing deep relaxation during treatment. Needs a medical assessment beforehand, and an escort home afterwards.',
  },
  {
    slug: 'special-needs-care',
    title: 'Special-needs dental care',
    text: 'Care adapted to a physical, cognitive or medical condition — longer appointments, additional support, and liaison with your doctor where that helps.',
  },
] as const;

export function ComfortCare() {
  const available = CARDS.filter((card) => hasAsset(card.slug));
  if (available.length === 0) return null;

  return (
    <section className="tl-section tl-section--sunken" aria-labelledby="comfort-heading">
      <div className="tl-container">
        <Reveal>
          <SectionHeading
            id="comfort-heading"
            eyebrow="Comfort & special care"
            title="Treatment that adapts to the patient"
            lead="Anxiety and additional needs are clinical facts, not inconveniences. Both of these are in the treatment catalogue, with the price range each usually falls in."
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
