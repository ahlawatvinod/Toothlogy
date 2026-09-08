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
 */

import Link from 'next/link';
import { Badge, Card, CardBody, CardHeader } from '@/design-system';

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
    <div className="tl-container tl-page" style={{ maxWidth: '44rem' }}>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{title}</h1>
          <Badge tone="warning">Not built yet</Badge>
        </div>
      </header>

      <Card label="Status">
        <CardHeader>
          <strong>What this will do</strong>
        </CardHeader>
        <CardBody>
          <p className="tl-muted">{description}</p>
          <p className="tl-muted">
            <strong>Planned for:</strong> {phase}
          </p>
          <p className="tl-muted" style={{ marginBlockEnd: 0 }}>
            It is shown here rather than hidden, and deliberately not mocked up: a search box
            that returns nothing, or an article list of placeholders, would tell you something
            untrue about your dental care.
          </p>
        </CardBody>
      </Card>

      {alternatives && alternatives.length > 0 ? (
        <Card label="What you can do now">
          <CardHeader>
            <strong>Available today</strong>
          </CardHeader>
          <CardBody>
            <div className="tl-hero__actions">
              {alternatives.map((alternative) => (
                <Link
                  key={alternative.href}
                  className="tl-button tl-button--secondary tl-button--md"
                  href={alternative.href}
                >
                  {alternative.label}
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
