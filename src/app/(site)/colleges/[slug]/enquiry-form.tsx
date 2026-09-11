/**
 * Ask a college about one of its courses. The student's name, email and
 * phone go to the college only with the consent ticked here.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

const EXAMS = [
  ['', 'Not yet / not applicable'],
  ['NEET_UG', 'NEET-UG'],
  ['NEET_MDS', 'NEET-MDS'],
  ['INI_CET', 'INI-CET'],
  ['INSTITUTIONAL', 'The college’s own test'],
] as const;

export function EnquiryForm({ collegeName, courses }: { collegeName: string; courses: ReadonlyArray<{ id: string; label: string; exam: string }> }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [qualification, setQualification] = useState('');
  const [exam, setExam] = useState('');
  const [rank, setRank] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!consent) return setError(`Agree to be contacted by ${collegeName} to send your enquiry.`);
    const rankNumber = rank.trim() ? Number(rank) : undefined;
    if (rankNumber !== undefined && (!Number.isInteger(rankNumber) || rankNumber < 1)) return setError('Enter your rank as a whole number, or leave it empty.');
    setBusy(true);
    const result = await api.post(`/api/v1/courses/${courseId}/enquiries`, {
      consentToContact: true,
      ...(qualification.trim() ? { qualification: qualification.trim() } : {}),
      ...(exam ? { examName: exam } : {}),
      ...(rankNumber ? { examRank: rankNumber } : {}),
      ...(message.trim() ? { message: message.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setSent(true);
  }

  if (sent) {
    return (
      <Alert tone="success" title="Enquiry sent">
        {collegeName} can now see your enquiry and contact details, and will get back to you. Follow it under <Link href="/account/admissions">My admissions</Link>.
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Course" required>
        {(props) => (
          <select {...props} className="tl-input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Your qualification (optional)" hint="For example “Class XII (PCB), 2026” or “BDS, 2024”.">
        {(props) => <Input {...props} value={qualification} maxLength={160} onChange={(e) => setQualification(e.target.value)} />}
      </Field>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Entrance exam (optional)">
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
        <Field label="Rank (optional)" hint="Shown to the college as yours, not checked.">
          {(props) => <Input {...props} inputMode="numeric" value={rank} onChange={(e) => setRank(e.target.value)} />}
        </Field>
      </div>
      <Field label="Your question (optional)">
        {(props) => <textarea {...props} className="tl-input" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />}
      </Field>
      <label className="tl-checkbox">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{collegeName} may contact me about this course using the name, email and phone number on my Toothlogy account.</span>
      </label>
      <div>
        <Button type="submit" loading={busy} disabled={!courseId}>
          Send enquiry
        </Button>
      </div>
    </form>
  );
}
