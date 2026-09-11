/**
 * A dental record, newest first: each entry's kind, date, teeth, who added it,
 * the note, its file, and — when retracted — the practice's reason. Then the
 * prescriptions. Shared by the patient's view and the practice's.
 */

import Link from 'next/link';
import { Badge } from '@/design-system';
import { ENTRY_KIND_LABEL } from '@/platform/records/labels';
import type { myRecord } from '@/platform/records/service';
import { OpenFileButton } from './open-file-button';
import { DeleteEntryButton, RetractEntryForm } from './entry-actions';

type Loaded = Awaited<ReturnType<typeof myRecord>>;
type Entry = Loaded['entries'][number];
type Rx = Loaded['prescriptions'][number];

const day = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
const issued = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

interface TimelineProps {
  readonly entries: ReadonlyArray<Entry>;
  /** Whose view: the patient deletes their own; a practice retracts its own. */
  readonly viewer: { kind: 'PATIENT'; userId: string } | { kind: 'PRACTICE'; organizationId: string; canRetract: boolean };
}

export function RecordTimeline({ entries, viewer }: TimelineProps) {
  if (entries.length === 0) return <p className="tl-muted" style={{ margin: 0 }}>Nothing in the record yet.</p>;
  return (
    <ol className="tl-list" aria-label="Record entries">
      {entries.map((e) => {
        const byPatient = e.organizationId === null;
        const mine = viewer.kind === 'PATIENT' ? byPatient && e.authorUserId === viewer.userId : e.organizationId === viewer.organizationId;
        return (
          <li key={e.id} className="tl-stack" aria-label={e.title}>
            <div className="tl-card__title-row">
              <strong style={e.retractedAt ? { textDecoration: 'line-through' } : undefined}>{e.title}</strong>
              <Badge tone="neutral">{ENTRY_KIND_LABEL[e.kind] ?? e.kind}</Badge>
              {e.retractedAt ? <Badge tone="warning">retracted</Badge> : null}
            </div>
            <span className="tl-list__meta">
              {day(e.occurredOn)}
              {e.teeth.length ? ` · teeth ${e.teeth.join(', ')}` : ''}
              {e.dependent ? ` · for ${e.dependent.name}` : ''}
              {' · '}
              {byPatient ? (viewer.kind === 'PATIENT' ? 'added by you' : 'added by the patient') : `added by ${e.organization?.name ?? 'a practice'}${e.author.displayName ? ` (${e.author.displayName})` : ''}`}
            </span>
            {e.notes ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{e.notes}</p> : null}
            {e.retractedAt ? <p className="tl-muted" style={{ margin: 0 }}>Retracted: {e.retractedReason}</p> : null}
            <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
              {e.file && e.file.status === 'ACTIVE' ? <OpenFileButton fileId={e.file.id} label={`Open ${e.file.originalFilename ?? 'file'}`} /> : null}
              {mine && viewer.kind === 'PATIENT' ? <DeleteEntryButton entryId={e.id} /> : null}
              {mine && viewer.kind === 'PRACTICE' && viewer.canRetract && !e.retractedAt ? <RetractEntryForm organizationId={viewer.organizationId} entryId={e.id} /> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function PrescriptionList({ prescriptions }: { prescriptions: ReadonlyArray<Rx> }) {
  if (prescriptions.length === 0) return <p className="tl-muted" style={{ margin: 0 }}>No prescriptions.</p>;
  return (
    <ul className="tl-list" aria-label="Prescriptions">
      {prescriptions.map((rx) => (
        <li key={rx.id}>
          <div className="tl-card__title-row">
            <Link href={`/prescriptions/${rx.id}`}>
              <strong>
                {issued(rx.issuedAt)} · {rx.organization.name}
              </strong>
            </Link>
            {rx.status === 'CANCELLED' ? <Badge tone="danger">cancelled</Badge> : <Badge tone="success">valid</Badge>}
          </div>
          <span className="tl-list__meta">
            {rx.prescriber.displayName ?? 'Dentist'} · {rx.items.map((i) => i.medicine).join(', ')}
            {rx.dependent ? ` · for ${rx.dependent.name}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
