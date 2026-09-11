/**
 * One conversation between a patient and a practice: who, about what, the
 * messages in order, and the composer for whoever may reply. Used by the
 * patient's and the practice's views alike.
 */

import Link from 'next/link';
import { Badge, Card, CardBody, CardHeader } from '@/design-system';
import type { getThread } from '@/platform/messaging/service';
import { ThreadComposer } from './thread-composer';

type Loaded = Awaited<ReturnType<typeof getThread>>;

export function ThreadView({ data, appointmentHref }: { data: Loaded; appointmentHref: string | null }) {
  const { thread, side, canReply } = data;
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  const mine = side;

  return (
    <div className="tl-stack">
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{thread.subject}</h1>
          <Badge tone={thread.status === 'OPEN' ? 'info' : 'neutral'}>{thread.status.toLowerCase()}</Badge>
        </div>
        <p className="tl-page__lead">
          {side === 'PATIENT' ? `With ${thread.organization.name}` : `From ${thread.patient.displayName ?? 'a patient'}`}
          {thread.appointment ? (
            <>
              {' · about '}
              {appointmentHref ? <Link href={appointmentHref}>{thread.appointment.serviceName}, {when(thread.appointment.startsAt)}</Link> : `${thread.appointment.serviceName}, ${when(thread.appointment.startsAt)}`}
            </>
          ) : null}
        </p>
      </header>
      <Card label="Messages">
        <CardHeader>
          <strong>Messages</strong>
        </CardHeader>
        <CardBody>
          <ol className="tl-list" aria-label="Messages">
            {thread.messages.map((m) => (
              <li key={m.id} className="tl-stack" style={{ borderInlineStart: m.side === mine ? '3px solid var(--tl-color-accent, currentColor)' : undefined, paddingInlineStart: 'var(--tl-space-3)' }}>
                <span className="tl-list__meta">
                  <strong>{m.side === mine ? 'You' : m.side === 'PATIENT' ? (thread.patient.displayName ?? 'Patient') : thread.organization.name}</strong> · {when(m.createdAt)}
                </span>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.body}</p>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
      {thread.status === 'OPEN' && canReply ? <ThreadComposer threadId={thread.id} /> : thread.status === 'CLOSED' ? <p className="tl-muted">This conversation is closed.</p> : <p className="tl-muted">You can read this conversation but not reply.</p>}
    </div>
  );
}
