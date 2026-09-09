/**
 * "Not built yet" surface.
 *
 * Used for routes that are linked from the navigation but whose feature belongs
 * to a later phase.
 *
 * The alternative — a convincing mock search box that returns nothing, or a
 * knowledge page of placeholder articles — is exactly what Constitution P1 and
 * P9 forbid. On a health platform a fake result is worse than no result: a
 * patient who believes they searched for a dentist and found none may conclude
 * there is no dentist near them.
 *
 * So the page says plainly what is missing, which phase builds it, and what the
 * visitor can usefully do now. That last part matters — an explanation with no
 * next step is still a dead end (§38).
 *
 * ON MAKING THIS PAGE LOOK GOOD
 * Being honest is not the same as being drab, and a visitor who lands here has
 * still landed on Toothlogy. It gets the same hero band, type scale and motion
 * as everything else. What it does not get is anything shaped like the missing
 * feature: no disabled search field, no greyed-out result cards, nothing that
 * could be mistaken for a thing that will work if you try harder.
 */

import Link from 'next/link';
import { Icon } from '@/design-system';
import { Reveal } from '@/components/motion/reveal';

export interface NotBuiltYetProps {
  readonly title: string;
  /** What this will do, described honestly in the future tense. */
  readonly description: string;
  /** Which phase delivers it, so the status is specific rather than vague. */
  readonly phase: string;
  /** Concrete things the visitor can do today. */
  readonly alternatives?: ReadonlyArray<{ href: string; label: string }>;
}

export function NotBuiltYet({ title, description, phase, alternatives }: NotBuiltYetProps) {
  return (
    <div className="tl-pending">
      <div className="tl-container">
        <Reveal className="tl-pending__inner">
          <p className="tl-eyebrow">
            <Icon name="clipboardCheck" />
            Not built yet
          </p>

          <h1 className="tl-pending__title">{title}</h1>
          <p className="tl-pending__lead">{description}</p>

          <p className="tl-pending__phase">
            <Icon name="calendarCheck" aria-hidden="true" />
            <span>
              <strong>Planned for:</strong> {phase}
            </span>
          </p>

          <p className="tl-pending__note">
            It is shown here rather than hidden, and deliberately not mocked up: a search box
            that returns nothing, or an article list of placeholders, would tell you something
            untrue about your dental care.
          </p>

          {alternatives && alternatives.length > 0 ? (
            <div className="tl-pending__actions">
              <h2 className="tl-pending__actions-heading">What you can do today</h2>
              <div className="tl-hero__actions">
                {alternatives.map((alternative, index) => (
                  <Link
                    key={alternative.href}
                    className={
                      index === 0
                        ? 'tl-button tl-button--primary tl-button--md'
                        : 'tl-button tl-button--secondary tl-button--md'
                    }
                    href={alternative.href}
                  >
                    {alternative.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </Reveal>
      </div>
    </div>
  );
}
