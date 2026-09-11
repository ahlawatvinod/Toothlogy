/**
 * The college console's forms: academic profile, a new course, and per
 * course: details, publish/archive and admission windows. Fees are entered
 * in rupees and sent in paise.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

type Notice = { tone: 'success' | 'danger'; text: string } | null;

const LEVELS = [
  ['BDS', 'BDS'],
  ['MDS', 'MDS'],
  ['DIPLOMA', 'Diploma'],
  ['CERTIFICATE', 'Certificate'],
  ['FELLOWSHIP', 'Fellowship'],
  ['PHD', 'PhD'],
] as const;
const EXAMS = [
  ['NEET_UG', 'NEET-UG'],
  ['NEET_MDS', 'NEET-MDS'],
  ['INI_CET', 'INI-CET'],
  ['INSTITUTIONAL', 'Our own test'],
  ['NONE', 'No entrance exam'],
] as const;
const OWNERSHIP = [
  ['', 'Not given'],
  ['GOVERNMENT', 'Government'],
  ['PRIVATE', 'Private'],
  ['DEEMED_UNIVERSITY', 'Deemed university'],
  ['AUTONOMOUS', 'Autonomous'],
] as const;

const toPaise = (rupees: string) => {
  const n = Number(rupees.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100)) : null;
};

export function CollegeProfileForm({ organizationId, profile }: { organizationId: string; profile: Record<'ownership' | 'affiliatedUniversity' | 'establishedYear' | 'recognitionBody' | 'recognitionReference' | 'admissionsEmail' | 'admissionsPhone', string> }) {
  const router = useRouter();
  const [values, setValues] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const orNull = (s: string) => (s.trim() ? s.trim() : null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const result = await api.patch<{ recognitionVerified: boolean }>(`/api/v1/organizations/${organizationId}/college`, {
      ownership: values.ownership || null,
      affiliatedUniversity: orNull(values.affiliatedUniversity),
      establishedYear: values.establishedYear.trim() ? Number(values.establishedYear) : null,
      recognitionBody: orNull(values.recognitionBody),
      recognitionReference: orNull(values.recognitionReference),
      admissionsEmail: orNull(values.admissionsEmail),
      admissionsPhone: orNull(values.admissionsPhone),
    });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: result.data.recognitionVerified ? 'Saved.' : 'Saved. Toothlogy staff check stated recognition before it shows as checked.' });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="tl-stack" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Ownership">
          {(props) => (
            <select {...props} className="tl-input" value={values.ownership} onChange={set('ownership')}>
              {OWNERSHIP.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Established (year)">
          {(props) => <Input {...props} inputMode="numeric" maxLength={4} value={values.establishedYear} onChange={set('establishedYear')} />}
        </Field>
      </div>
      <Field label="Affiliated university">
        {(props) => <Input {...props} maxLength={200} value={values.affiliatedUniversity} onChange={set('affiliatedUniversity')} />}
      </Field>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Recognised by" hint="For example “Dental Council of India”.">
          {(props) => <Input {...props} maxLength={120} value={values.recognitionBody} onChange={set('recognitionBody')} />}
        </Field>
        <Field label="Recognition reference" hint="The letter or list number.">
          {(props) => <Input {...props} maxLength={120} value={values.recognitionReference} onChange={set('recognitionReference')} />}
        </Field>
      </div>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Admissions email">
          {(props) => <Input {...props} type="email" maxLength={254} value={values.admissionsEmail} onChange={set('admissionsEmail')} />}
        </Field>
        <Field label="Admissions phone">
          {(props) => <Input {...props} type="tel" maxLength={24} value={values.admissionsPhone} onChange={set('admissionsPhone')} />}
        </Field>
      </div>
      <div>
        <Button type="submit" loading={busy}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

export function NewCourseForm({ organizationId, specialties, currency }: { organizationId: string; specialties: ReadonlyArray<{ key: string; name: string }>; currency: string }) {
  const router = useRouter();
  const [level, setLevel] = useState('BDS');
  const [specialtyKey, setSpecialtyKey] = useState('');
  const [name, setName] = useState('Bachelor of Dental Surgery');
  const [months, setMonths] = useState('60');
  const [seats, setSeats] = useState('');
  const [fee, setFee] = useState('');
  const [exam, setExam] = useState('NEET_UG');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  function chooseLevel(next: string) {
    setLevel(next);
    if (next === 'BDS') {
      setName('Bachelor of Dental Surgery');
      setMonths('60');
      setExam('NEET_UG');
    } else if (next === 'MDS') {
      setName('Master of Dental Surgery');
      setMonths('36');
      setExam('NEET_MDS');
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    const paise = fee.trim() ? toPaise(fee) : null;
    if (fee.trim() && paise === null) return setNotice({ tone: 'danger', text: 'Enter the fee in rupees, digits only.' });
    if (level === 'MDS' && !specialtyKey) return setNotice({ tone: 'danger', text: 'Choose the MDS specialty.' });
    setBusy(true);
    const result = await api.post(
      `/api/v1/organizations/${organizationId}/courses`,
      {
        level,
        ...(specialtyKey ? { specialtyKey } : {}),
        name: name.trim(),
        durationMonths: Number(months),
        ...(seats.trim() ? { seats: Number(seats) } : {}),
        ...(paise !== null ? { annualFeeMinor: paise } : {}),
        entranceExam: exam,
      },
      { idempotencyKey: newIdempotencyKey() },
    );
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: 'Added as a draft. Publish it when the details are right.' });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="tl-stack" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Level">
          {(props) => (
            <select {...props} className="tl-input" value={level} onChange={(e) => chooseLevel(e.target.value)}>
              {LEVELS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
        {level === 'MDS' || level === 'DIPLOMA' || level === 'FELLOWSHIP' ? (
          <Field label={level === 'MDS' ? 'Specialty' : 'Specialty (optional)'}>
            {(props) => (
              <select {...props} className="tl-input" value={specialtyKey} onChange={(e) => setSpecialtyKey(e.target.value)}>
                <option value="">Choose…</option>
                {specialties.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <Field label="Entrance exam">
          {(props) => (
            <select {...props} className="tl-input" value={exam} onChange={(e) => setExam(e.target.value)}>
              {EXAMS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="Course name">
        {(props) => <Input {...props} maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Duration (months)" hint="BDS: 60 including the internship.">
          {(props) => <Input {...props} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />}
        </Field>
        <Field label="Seats (optional)">
          {(props) => <Input {...props} inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} />}
        </Field>
        <Field label={`Fee per year, ${currency} (optional)`}>
          {(props) => <Input {...props} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />}
        </Field>
      </div>
      <div>
        <Button type="submit" loading={busy}>
          Add course
        </Button>
      </div>
    </form>
  );
}

export function CourseEditor({ course }: { course: { id: string; name: string; status: string; seats: string; feeRupees: string; description: string } }) {
  const router = useRouter();
  const [panel, setPanel] = useState<'edit' | 'window' | null>(null);
  const [seats, setSeats] = useState(course.seats);
  const [fee, setFee] = useState(course.feeRupees);
  const [description, setDescription] = useState(course.description);
  const year = new Date().getFullYear();
  const [academicYear, setAcademicYear] = useState(`${year}-${String((year + 1) % 100).padStart(2, '0')}`);
  const [opensOn, setOpensOn] = useState('');
  const [closesOn, setClosesOn] = useState('');
  const [windowSeats, setWindowSeats] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function patch(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setNotice(null);
    const result = await api.patch(`/api/v1/courses/${course.id}`, body);
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    setPanel(null);
    router.refresh();
  }

  async function saveWindow() {
    setBusy(true);
    setNotice(null);
    const result = await api.post(`/api/v1/courses/${course.id}/cycles`, { academicYear, opensOn, closesOn, ...(windowSeats.trim() ? { seats: Number(windowSeats) } : {}) });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: `Admission window for ${academicYear} saved.` });
    setPanel(null);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {course.status !== 'PUBLISHED' ? (
          <Button size="sm" loading={busy && panel === null} onClick={() => patch({ status: 'PUBLISHED' }, 'Published: students can see it and enquire.')}>
            Publish
          </Button>
        ) : (
          <Button size="sm" variant="ghost" loading={busy && panel === null} onClick={() => patch({ status: 'ARCHIVED' }, 'Archived: no longer shown.')}>
            Archive
          </Button>
        )}
        <Button size="sm" variant="secondary" aria-expanded={panel === 'edit'} onClick={() => setPanel(panel === 'edit' ? null : 'edit')}>
          Edit details
        </Button>
        <Button size="sm" variant="secondary" aria-expanded={panel === 'window'} onClick={() => setPanel(panel === 'window' ? null : 'window')}>
          Admission window
        </Button>
      </div>
      {panel === 'edit' ? (
        <div className="tl-stack">
          <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Seats">
              {(props) => <Input {...props} inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} />}
            </Field>
            <Field label="Fee per year (rupees)">
              {(props) => <Input {...props} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />}
            </Field>
          </div>
          <Field label="Description">
            {(props) => <textarea {...props} className="tl-input" rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
          <div>
            <Button
              size="sm"
              loading={busy}
              onClick={() => {
                const paise = fee.trim() ? toPaise(fee) : null;
                if (fee.trim() && paise === null) return setNotice({ tone: 'danger', text: 'Enter the fee in rupees, digits only.' });
                void patch({ seats: seats.trim() ? Number(seats) : null, annualFeeMinor: paise, description: description.trim() || null }, 'Saved.');
              }}
            >
              Save
            </Button>
          </div>
        </div>
      ) : null}
      {panel === 'window' ? (
        <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Academic year">
            {(props) => <Input {...props} value={academicYear} maxLength={7} onChange={(e) => setAcademicYear(e.target.value)} />}
          </Field>
          <Field label="Opens">
            {(props) => <Input {...props} type="date" value={opensOn} onChange={(e) => setOpensOn(e.target.value)} />}
          </Field>
          <Field label="Closes">
            {(props) => <Input {...props} type="date" value={closesOn} onChange={(e) => setClosesOn(e.target.value)} />}
          </Field>
          <Field label="Seats this year (optional)">
            {(props) => <Input {...props} inputMode="numeric" value={windowSeats} onChange={(e) => setWindowSeats(e.target.value)} />}
          </Field>
          <Button size="sm" loading={busy} disabled={!opensOn || !closesOn} onClick={saveWindow}>
            Save window
          </Button>
        </div>
      ) : null}
    </div>
  );
}
