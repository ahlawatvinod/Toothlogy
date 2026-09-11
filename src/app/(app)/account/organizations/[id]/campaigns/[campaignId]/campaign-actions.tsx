/**
 * Activate, pause, resume or cancel a campaign; add to its budget; change its
 * targeting. Each lifecycle action carries its own idempotency key, kept
 * until it succeeds, so a double click or a retry acts once.
 */

'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

type Action = 'ACTIVATE' | 'PAUSE' | 'RESUME' | 'CANCEL';

const TYPES = [
  ['CLINIC', 'Clinic visits'],
  ['VIDEO', 'Video consultations'],
  ['HOME_VISIT', 'Home visits'],
] as const;

export function CampaignActions({
  campaignId,
  status,
  currency,
  budgetMinor,
  treatments,
  targetTreatmentKeys,
  targetAppointmentTypes,
  targetRadiusKm,
}: {
  campaignId: string;
  status: string;
  currency: string;
  budgetMinor: string;
  treatments: ReadonlyArray<{ key: string; name: string }>;
  targetTreatmentKeys: readonly string[];
  targetAppointmentTypes: readonly string[];
  targetRadiusKm: number | null;
}) {
  const router = useRouter();
  const keys = useRef<Partial<Record<Action, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [extra, setExtra] = useState('');
  const [editing, setEditing] = useState(false);
  const [types, setTypes] = useState<string[]>([...targetAppointmentTypes]);
  const [chosen, setChosen] = useState<string[]>([...targetTreatmentKeys]);
  const [radius, setRadius] = useState(targetRadiusKm ? String(targetRadiusKm) : '');
  const closed = ['ENDED', 'EXHAUSTED', 'CANCELLED'].includes(status);
  const format = (minor: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);

  async function act(action: Action, done: string) {
    keys.current[action] ??= newIdempotencyKey();
    setBusy(action);
    setNotice(null);
    const result = await api.post(`/api/v1/campaigns/${campaignId}/actions`, { action, ...(reason.trim() ? { reason: reason.trim() } : {}) }, { idempotencyKey: keys.current[action] });
    setBusy(null);
    if (!result.ok) {
      keys.current[action] = undefined;
      return setNotice({ tone: 'danger', text: result.message });
    }
    keys.current[action] = undefined;
    setNotice({ tone: 'success', text: done });
    setCancelling(false);
    router.refresh();
  }

  async function save(body: Record<string, unknown>, done: string) {
    setBusy('SAVE');
    setNotice(null);
    const result = await api.patch(`/api/v1/campaigns/${campaignId}`, body, { idempotencyKey: newIdempotencyKey() });
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    setEditing(false);
    setExtra('');
    router.refresh();
  }

  if (closed) return notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null;

  return (
    <Card label="Campaign actions">
      <CardBody>
        <div className="tl-stack">
          {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
          <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
            {status === 'DRAFT' ? (
              <Button loading={busy === 'ACTIVATE'} onClick={() => act('ACTIVATE', 'Active. The budget is held from your wallet.')}>
                Activate (holds {format(Number(budgetMinor))} from the wallet)
              </Button>
            ) : null}
            {status === 'ACTIVE' ? (
              <Button variant="secondary" loading={busy === 'PAUSE'} onClick={() => act('PAUSE', 'Paused. It is not shown, and no new day is charged, until you resume.')}>
                Pause
              </Button>
            ) : null}
            {status === 'PAUSED' ? (
              <Button loading={busy === 'RESUME'} onClick={() => act('RESUME', 'Running again.')}>
                Resume
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setCancelling((v) => !v)} aria-expanded={cancelling}>
              Cancel campaign
            </Button>
            <Button variant="ghost" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              Change targeting
            </Button>
          </div>

          {cancelling ? (
            <div className="tl-stack">
              <Field label="Reason (optional)">
                {(props) => <Input {...props} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />}
              </Field>
              <p className="tl-muted" style={{ margin: 0 }}>
                Cancelling stops the campaign now. Whatever was held but not spent returns to the wallet.
              </p>
              <div>
                <Button variant="danger" loading={busy === 'CANCEL'} onClick={() => act('CANCEL', 'Cancelled. The unspent budget is back in your wallet.')}>
                  Confirm cancellation
                </Button>
              </div>
            </div>
          ) : null}

          {status !== 'DRAFT' ? (
            <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label={`Add to budget (${currency}, GST included)`} hint="Held from the wallet at once.">
                {(props) => <Input {...props} inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} />}
              </Field>
              <Button
                variant="secondary"
                loading={busy === 'SAVE'}
                onClick={() => {
                  const add = Math.round(Number(extra) * 100);
                  if (!Number.isFinite(add) || add <= 0) return setNotice({ tone: 'danger', text: 'Enter an amount to add.' });
                  void save({ budgetMinor: String(Number(budgetMinor) + add) }, 'Budget increased.');
                }}
              >
                Add to budget
              </Button>
            </div>
          ) : null}

          {editing ? (
            <div className="tl-stack">
              <fieldset className="tl-fieldset">
                <legend className="tl-fieldset__legend">Appointment types (none ticked: any)</legend>
                {TYPES.map(([value, label]) => (
                  <label key={value} className="tl-checkbox">
                    <input type="checkbox" checked={types.includes(value)} onChange={(e) => setTypes((t) => (e.target.checked ? [...t, value] : t.filter((x) => x !== value)))} />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>
              <Field label="Treatments (none selected: any search)">
                {(props) => (
                  <select {...props} multiple size={6} className="tl-input" value={chosen} onChange={(e) => setChosen(Array.from(e.target.selectedOptions).map((o) => o.value))}>
                    {treatments.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Show to searches within">
                {(props) => (
                  <select {...props} className="tl-input" value={radius} onChange={(e) => setRadius(e.target.value)}>
                    <option value="">Anywhere</option>
                    {[5, 10, 25, 50].map((km) => (
                      <option key={km} value={km}>
                        {km} km of the branch
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <div>
                <Button loading={busy === 'SAVE'} onClick={() => save({ targetAppointmentTypes: types, targetTreatmentKeys: chosen, targetRadiusKm: radius ? Number(radius) : null }, 'Targeting saved.')}>
                  Save targeting
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
