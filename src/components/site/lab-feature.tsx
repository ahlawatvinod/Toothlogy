/**
 * Dental laboratory feature (specification §18).
 *
 * A full-width split: the approved laboratory photograph on one side, the
 * explanation and a call to action on the other.
 *
 * Renders `null` until the photograph is delivered. The section is entirely
 * about the image — a split layout with an empty half is not a degraded
 * version of this, it is a broken one — so it is absent rather than partial.
 */

import Link from 'next/link';
import { Icon } from '@/design-system';
import { ServiceImage } from '@/components/media/asset-image';
import { hasAsset } from '@/platform/media';
import { Reveal } from '@/components/motion/reveal';
import { SectionHeading } from './sections';

const BENEFITS = [
  'Custom-fabricated appliances, made to your own impressions or scan',
  'A digital workflow, from scan to finished appliance',
  'Precision fit, checked on your model before it reaches you',
  'Professional laboratory support behind your dentist',
] as const;

export function LabFeature() {
  if (!hasAsset('dental-lab-custom-appliance')) return null;

  return (
    <section className="tl-section tl-section--sunken" aria-labelledby="lab-heading">
      <div className="tl-container tl-feature-split">
        <Reveal variant="scale">
          <ServiceImage
            slug="dental-lab-custom-appliance"
            /* `contain` rather than `cover`: this composition carries labelled
               appliance insets around the edges, and cropping to fill a frame
               would cut the very things it is there to show (§21). */
            fit="contain"
            sizes="(max-width: 60rem) 100vw, 34rem"
          />
        </Reveal>

        <Reveal className="tl-feature-split__body" delay={90}>
          <SectionHeading
            id="lab-heading"
            eyebrow="Dental laboratory"
            title="Dental Lab & Custom Appliances"
            lead="Night guards, sports mouthguards, retainers, dentures and aligners are made individually, from your own impressions or a digital scan."
          />

          <ul className="tl-feature-split__list">
            {BENEFITS.map((benefit) => (
              <li key={benefit}>
                <Icon name="shieldCheck" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          {/* Points at the treatment catalogue, which genuinely lists these
              appliances. A button that led nowhere would be exactly the kind
              of fake control the repository forbids. */}
          <Link className="tl-button tl-button--primary tl-button--md" href="/find">
            Explore custom dental solutions
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
