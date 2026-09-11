/**
 * A Sponsored result. Always labelled "Sponsored" and named for what was
 * bought ("Prime dentist" / "Prime clinic" / "Prime hospital"), on every
 * surface — search, profiles and the campaign preview — so a paid placement
 * can never pass for an organic one (Constitution P3).
 */

import Link from 'next/link';
import { Badge, Card, CardBody } from '@/design-system';

export interface SponsoredCardSlot {
  readonly tier: string;
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
  readonly next: { localDate: string; localTime: string } | null;
}

function slotLabel(s: { localDate: string; localTime: string }): string {
  const day = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${s.localDate}T00:00:00Z`));
  return `${day}, ${s.localTime}`;
}

export function SponsoredCard({ slot, preview = false }: { slot: SponsoredCardSlot; preview?: boolean }) {
  return (
    <Card label={`Sponsored: ${slot.title}`}>
      <CardBody>
        <div className="tl-card__title-row">
          {preview ? <strong>{slot.title}</strong> : (
            <Link href={slot.href} prefetch={false}>
              <strong>{slot.title}</strong>
            </Link>
          )}
          <Badge tone="warning">Sponsored</Badge>
          <span className="tl-muted">{slot.tier}</span>
        </div>
        {slot.subtitle ? <p className="tl-list__meta" style={{ margin: 0 }}>{slot.subtitle}</p> : null}
        <p className="tl-inline" style={{ margin: 0 }}>
          {preview ? (
            <span className="tl-button tl-button--secondary tl-button--sm" aria-hidden="true">
              <span>View and book</span>
            </span>
          ) : (
            <Link className="tl-button tl-button--secondary tl-button--sm" href={slot.href} prefetch={false}>
              <span>View and book</span>
            </Link>
          )}
          <span className="tl-muted">{slot.next ? `Next free: ${slotLabel(slot.next)}` : 'Next free time shown when live'}</span>
        </p>
      </CardBody>
    </Card>
  );
}
