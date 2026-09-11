/**
 * An enterprise agreement's terms and how it is being met: support service
 * levels (met, breached, running), data residency against the declared
 * hosting region, single sign-on against the SSO port. Shared by the staff
 * and group pages.
 */

import { Badge } from '@/design-system';

interface Tally {
  MET: number;
  BREACHED: number;
  RUNNING: number;
}

export interface AgreementView {
  reference: string;
  status: 'ACTIVE' | 'ENDED';
  startsOn: Date;
  endsOn: Date;
  firstResponseHours: number;
  resolutionHours: number;
  dataResidency: string;
  ssoRequired: boolean;
  notes: string | null;
  endedReason: string | null;
  residency: { required: string; hosted: string | null; met: boolean };
  sso: { required: boolean; connected: boolean };
  sla: { tickets: number; firstResponse: Tally; resolution: Tally };
}

const day = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
const tally = (t: Tally) => `${t.MET} met · ${t.BREACHED} breached · ${t.RUNNING} running`;

export function AgreementSummary({ agreement }: { agreement: AgreementView }) {
  return (
    <div className="tl-stack">
      <div className="tl-card__title-row">
        <strong>Agreement {agreement.reference}</strong>
        <Badge tone={agreement.status === 'ACTIVE' ? 'success' : 'neutral'}>{agreement.status === 'ACTIVE' ? 'Current' : 'Ended'}</Badge>
      </div>
      <dl className="tl-kv">
        <div>
          <dt>Term</dt>
          <dd>
            {day(agreement.startsOn)} to {day(agreement.endsOn)}
            {agreement.endedReason ? ` · ended: ${agreement.endedReason}` : ''}
          </dd>
        </div>
        <div>
          <dt>Support service levels</dt>
          <dd>
            First response within {agreement.firstResponseHours} hours, resolution within {agreement.resolutionHours} hours
          </dd>
        </div>
        <div>
          <dt>Results ({agreement.sla.tickets} requests)</dt>
          <dd>
            First response: {tally(agreement.sla.firstResponse)}
            <br />
            Resolution: {tally(agreement.sla.resolution)}
          </dd>
        </div>
        <div>
          <dt>Data residency</dt>
          <dd>
            Required in {agreement.residency.required}.{' '}
            {agreement.residency.hosted === null ? (
              <Badge tone="warning">Hosting region not declared</Badge>
            ) : agreement.residency.met ? (
              <Badge tone="success">Hosted in {agreement.residency.hosted}</Badge>
            ) : (
              <Badge tone="warning">Hosted in {agreement.residency.hosted} — not met</Badge>
            )}
          </dd>
        </div>
        <div>
          <dt>Single sign-on</dt>
          <dd>
            {!agreement.sso.required ? 'Not required' : agreement.sso.connected ? <Badge tone="success">Required and connected</Badge> : <Badge tone="warning">Required — enterprise sign-in is not connected yet</Badge>}
          </dd>
        </div>
        {agreement.notes ? (
          <div>
            <dt>Notes</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{agreement.notes}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
