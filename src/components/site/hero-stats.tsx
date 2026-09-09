/**
 * The trust strip below the hero.
 *
 * EVERY FIGURE HERE IS COUNTED, NOT WRITTEN.
 *
 * The reference design calls for "100+ Trusted Dentists · 50+ Partner Clinics ·
 * 4.8 Average Rating". Toothlogy has no dentists, no partner clinics and no
 * reviews yet — discovery is Phase 4 and reviews are Phase 5 — so those three
 * numbers would be fabrications sitting under a headline about trust. On a
 * health platform an invented rating is the single most actionable false claim
 * you can make, and the brief itself says not to invent statistics.
 *
 * So the strip keeps the design and changes the subject: what the platform
 * genuinely has, counted from the registry and the catalogue as the page
 * renders. Nothing here can drift from what the repository contains, and the
 * counter animates a value it was handed rather than one it invented.
 */

import { Icon, type IconName } from '@/design-system';
import { Counter } from '@/components/motion/counter';
import { Reveal } from '@/components/motion/reveal';

export interface HeroStat {
  readonly icon: IconName;
  readonly value: number;
  readonly suffix?: string;
  readonly label: string;
  readonly meta: string;
}

export function HeroStats({ stats }: { readonly stats: readonly HeroStat[] }) {
  return (
    <div className="tl-container">
      <Reveal className="tl-trust">
        <ul className="tl-trust__list">
          {stats.map((stat, index) => (
            <Reveal as="li" key={stat.label} className="tl-trust__item" delay={index * 90}>
              <span className="tl-trust__icon" aria-hidden="true">
                <Icon name={stat.icon} />
              </span>
              <span className="tl-trust__text">
                <span className="tl-trust__value">
                  <Counter value={stat.value} suffix={stat.suffix} />
                </span>
                <span className="tl-trust__label">{stat.label}</span>
                <span className="tl-trust__meta">{stat.meta}</span>
              </span>
            </Reveal>
          ))}
        </ul>
      </Reveal>
    </div>
  );
}
