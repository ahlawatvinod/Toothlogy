/**
 * Academic profile forms: the profile itself, publications, and faculty
 * posts at colleges (ask to confirm, end).
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

type Notice = { tone: 'success' | 'danger'; text: string } | null;

function useSend() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  async function send(method: 'post' | 'delete', url: string, body: Record<string, unknown> | undefined, done: string, key?: string) {
    setBusy(true);
    setNotice(null);
    const result = method === 'post' ? await api.post(url, body ?? {}, key ? { idempotencyKey: key } : undefined) : await api.delete(url);
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return false;
    }
    setNotice({ tone: 'success', text: done });
    router.refresh();
    return true;
  }
  return { busy, notice, send };
}

type ProfileValues = { displayName: string; headline: string; bio: string; isPublic: boolean; designation: string; department: string; institution: string; orcid: string; website: string; interests: string[] };

export function AcademicProfileForm({ type, interests, profile }: { type: 'RESEARCHER' | 'FACULTY'; interests: ReadonlyArray<{ key: string; name: string }>; profile: ProfileValues }) {
  const { busy, notice, send } = useSend();
  const [v, setV] = useState(profile);
  const set = (key: keyof Omit<ProfileValues, 'isPublic' | 'interests'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [key]: e.target.value }));
  const orNull = (s: string) => (s.trim() ? s.trim() : null);

  return (
    <form
      className="tl-stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void send(
          'post',
          '/api/v1/me/academic',
          { type, displayName: v.displayName.trim(), headline: orNull(v.headline), bio: orNull(v.bio), isPublic: v.isPublic, designation: orNull(v.designation), department: orNull(v.department), institution: orNull(v.institution), orcid: orNull(v.orcid), website: orNull(v.website), interests: v.interests },
          'Saved.',
        );
      }}
    >
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Name as shown" required>
          {(props) => <Input {...props} maxLength={120} value={v.displayName} onChange={set('displayName')} />}
        </Field>
        <Field label="Headline (optional)">
          {(props) => <Input {...props} maxLength={160} value={v.headline} onChange={set('headline')} />}
        </Field>
      </div>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Designation">
          {(props) => <Input {...props} maxLength={120} value={v.designation} onChange={set('designation')} />}
        </Field>
        <Field label="Department">
          {(props) => <Input {...props} maxLength={120} value={v.department} onChange={set('department')} />}
        </Field>
        <Field label="Institution">
          {(props) => <Input {...props} maxLength={200} value={v.institution} onChange={set('institution')} />}
        </Field>
      </div>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="ORCID (optional)" hint="0000-0002-1825-0097">
          {(props) => <Input {...props} maxLength={19} value={v.orcid} onChange={set('orcid')} />}
        </Field>
        <Field label="Website (optional)">
          {(props) => <Input {...props} type="url" maxLength={300} value={v.website} onChange={set('website')} />}
        </Field>
      </div>
      <fieldset className="tl-fieldset">
        <legend className="tl-fieldset__legend">Interests</legend>
        <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
          {interests.map((i) => (
            <label key={i.key} className="tl-checkbox">
              <input type="checkbox" checked={v.interests.includes(i.key)} onChange={(e) => setV((x) => ({ ...x, interests: e.target.checked ? [...x.interests, i.key] : x.interests.filter((k) => k !== i.key) }))} />
              <span>{i.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="About you (optional)">
        {(props) => <textarea {...props} className="tl-input" rows={3} maxLength={4000} value={v.bio} onChange={set('bio')} />}
      </Field>
      <label className="tl-checkbox">
        <input type="checkbox" checked={v.isPublic} onChange={(e) => setV((x) => ({ ...x, isPublic: e.target.checked }))} />
        <span>Show this profile publicly</span>
      </label>
      <div>
        <Button type="submit" loading={busy} disabled={v.displayName.trim().length < 2}>
          Save {type === 'FACULTY' ? 'faculty' : 'researcher'} profile
        </Button>
      </div>
    </form>
  );
}

export function PublicationForm({ type }: { type: 'RESEARCHER' | 'FACULTY' }) {
  const { busy, notice, send } = useSend();
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [year, setYear] = useState('');
  const [doi, setDoi] = useState('');
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Title">
          {(props) => <Input {...props} maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Journal or conference">
          {(props) => <Input {...props} maxLength={200} value={venue} onChange={(e) => setVenue(e.target.value)} />}
        </Field>
        <Field label="Year">
          {(props) => <Input {...props} inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value)} />}
        </Field>
        <Field label="DOI (optional)">
          {(props) => <Input {...props} maxLength={200} value={doi} onChange={(e) => setDoi(e.target.value)} />}
        </Field>
        <Button
          size="sm"
          loading={busy}
          disabled={title.trim().length < 5 || !/^\d{4}$/.test(year)}
          onClick={async () => {
            const ok = await send('post', '/api/v1/me/academic/publications', { type, title: title.trim(), venue: venue.trim() || null, year: Number(year), doi: doi.trim() || null }, 'Publication added.', newIdempotencyKey());
            if (ok) {
              setTitle('');
              setVenue('');
              setYear('');
              setDoi('');
            }
          }}
        >
          Add publication
        </Button>
      </div>
    </div>
  );
}

export function RemovePublication({ publicationId }: { publicationId: string }) {
  const { busy, notice, send } = useSend();
  return (
    <>
      {notice?.tone === 'danger' ? <Alert tone="danger">{notice.text}</Alert> : null}
      <Button size="sm" variant="ghost" loading={busy} onClick={() => send('delete', `/api/v1/me/academic/publications/${publicationId}`, undefined, 'Removed.')}>
        Remove
      </Button>
    </>
  );
}

export function AppointmentRequest({ colleges }: { colleges: ReadonlyArray<{ id: string; name: string }> }) {
  const { busy, notice, send } = useSend();
  const [organizationId, setOrganizationId] = useState(colleges[0]?.id ?? '');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('');
  if (colleges.length === 0) return <p className="tl-muted">No college on Toothlogy can confirm faculty posts yet.</p>;
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="College">
          {(props) => (
            <select {...props} className="tl-input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Your designation there">
          {(props) => <Input {...props} maxLength={120} value={designation} onChange={(e) => setDesignation(e.target.value)} />}
        </Field>
        <Field label="Department (optional)">
          {(props) => <Input {...props} maxLength={120} value={department} onChange={(e) => setDepartment(e.target.value)} />}
        </Field>
        <Button size="sm" loading={busy} disabled={designation.trim().length < 2} onClick={() => send('post', '/api/v1/me/academic/appointments', { organizationId, designation: designation.trim(), department: department.trim() || null }, 'Sent. The college will confirm it.')}>
          Ask the college to confirm
        </Button>
      </div>
    </div>
  );
}

export function EndAppointment({ appointmentId }: { appointmentId: string }) {
  const { busy, notice, send } = useSend();
  return (
    <>
      {notice?.tone === 'danger' ? <Alert tone="danger">{notice.text}</Alert> : null}
      <Button size="sm" variant="ghost" loading={busy} onClick={() => send('post', `/api/v1/faculty-appointments/${appointmentId}`, { decision: 'END' }, 'Ended.')}>
        I no longer hold this post
      </Button>
    </>
  );
}
