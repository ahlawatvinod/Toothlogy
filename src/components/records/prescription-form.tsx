/**
 * Write a prescription: one row per medicine (name, strength, dose, how often,
 * how long, instructions), advice, and who it is for. One idempotency key for
 * the whole form, so a retried submit cannot issue it twice.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

interface Row {
  key: number;
  medicine: string;
  strength: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
}

const blank = (key: number): Row => ({ key, medicine: '', strength: '', dose: '', frequency: '', duration: '', instructions: '' });

interface Props {
  readonly organizationId: string;
  readonly patientUserId: string;
  readonly dependents: ReadonlyArray<{ id: string; name: string }>;
  readonly appointments: ReadonlyArray<{ id: string; label: string }>;
}

export function PrescriptionForm({ organizationId, patientUserId, dependents, appointments }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([blank(1)]);
  const [advice, setAdvice] = useState('');
  const [dependentId, setDependentId] = useState('');
  const [appointmentId, setAppointmentId] = useState(appointments[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => newIdempotencyKey());

  const update = (k: number, field: keyof Omit<Row, 'key'>, value: string) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, [field]: value } : r)));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const items = rows.map(({ medicine, strength, dose, frequency, duration, instructions }) => ({
      medicine: medicine.trim(),
      dose: dose.trim(),
      frequency: frequency.trim(),
      duration: duration.trim(),
      ...(strength.trim() ? { strength: strength.trim() } : {}),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
    }));
    const result = await api.post<{ prescriptionId: string }>(
      `/api/v1/organizations/${organizationId}/patients/${patientUserId}/prescriptions`,
      { items, ...(advice.trim() ? { advice: advice.trim() } : {}), ...(dependentId ? { dependentId } : {}), ...(appointmentId ? { appointmentId } : {}) },
      { idempotencyKey: key },
    );
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.push(`/prescriptions/${result.data.prescriptionId}`);
  }

  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <ol className="tl-list" aria-label="Medicines">
        {rows.map((r, index) => (
          <li key={r.key} className="tl-stack" aria-label={`Medicine ${index + 1}`}>
            <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="Medicine">{(props) => <Input {...props} maxLength={120} value={r.medicine} onChange={(e) => update(r.key, 'medicine', e.target.value)} />}</Field>
              <Field label="Strength">{(props) => <Input {...props} maxLength={60} value={r.strength} onChange={(e) => update(r.key, 'strength', e.target.value)} />}</Field>
              <Field label="Dose">{(props) => <Input {...props} maxLength={60} value={r.dose} onChange={(e) => update(r.key, 'dose', e.target.value)} />}</Field>
              <Field label="How often">{(props) => <Input {...props} maxLength={60} value={r.frequency} onChange={(e) => update(r.key, 'frequency', e.target.value)} />}</Field>
              <Field label="For how long">{(props) => <Input {...props} maxLength={60} value={r.duration} onChange={(e) => update(r.key, 'duration', e.target.value)} />}</Field>
            </div>
            <Field label="Instructions (optional)">{(props) => <Input {...props} maxLength={200} value={r.instructions} onChange={(e) => update(r.key, 'instructions', e.target.value)} />}</Field>
            {rows.length > 1 ? (
              <div>
                <Button type="button" variant="ghost" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                  Remove this medicine
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {rows.length < 15 ? (
        <div>
          <Button type="button" variant="secondary" onClick={() => setRows((rs) => [...rs, blank(Math.max(...rs.map((x) => x.key)) + 1)])}>
            Add another medicine
          </Button>
        </div>
      ) : null}
      <Field label="Advice (optional)">{(props) => <textarea {...props} className="tl-input" rows={3} maxLength={1000} value={advice} onChange={(e) => setAdvice(e.target.value)} />}</Field>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {dependents.length > 0 ? (
          <Field label="For">
            {(props) => (
              <select {...props} className="tl-input" value={dependentId} onChange={(e) => setDependentId(e.target.value)}>
                <option value="">The account holder</option>
                {dependents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        {appointments.length > 0 ? (
          <Field label="Visit">
            {(props) => (
              <select {...props} className="tl-input" value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)}>
                <option value="">Not tied to a visit</option>
                {appointments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
      </div>
      <div>
        <Button type="submit" loading={busy}>
          Issue prescription
        </Button>
      </div>
    </form>
  );
}
