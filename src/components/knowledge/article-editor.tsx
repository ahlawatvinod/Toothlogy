/**
 * Write or revise an article: kind, title, summary, text, sources, the
 * treatment it explains, specialty and cover. Save keeps the working copy;
 * "Save and send for review" hands it to a reviewer. Once published, kind,
 * treatment, specialty and cover are fixed.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { ARTICLE_KINDS, CLINICAL_KINDS, type Citation } from '@/platform/knowledge/labels';

interface Working {
  readonly id?: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly citations: ReadonlyArray<Citation>;
  readonly treatmentKey: string;
  readonly specialtyKey: string;
  readonly coverFileId: string;
  readonly published: boolean;
  readonly canSubmit: boolean;
  readonly archived: boolean;
}

interface Row {
  key: number;
  title: string;
  source: string;
  year: string;
  url: string;
}

interface Props {
  readonly initial: Working;
  readonly treatments: ReadonlyArray<{ key: string; name: string }>;
  readonly specialties: ReadonlyArray<{ key: string; name: string }>;
}

export function ArticleEditor({ initial, treatments, specialties }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState(initial.kind);
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [body, setBody] = useState(initial.body);
  const [rows, setRows] = useState<Row[]>(() =>
    initial.citations.length
      ? initial.citations.map((c, i) => ({ key: i + 1, title: c.title, source: c.source, year: c.year ? String(c.year) : '', url: c.url ?? '' }))
      : [{ key: 1, title: '', source: '', year: '', url: '' }],
  );
  const [treatmentKey, setTreatmentKey] = useState(initial.treatmentKey);
  const [specialtyKey, setSpecialtyKey] = useState(initial.specialtyKey);
  const [coverFileId, setCoverFileId] = useState(initial.coverFileId);
  const [reason, setReason] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [createKey] = useState(() => newIdempotencyKey());
  const locked = initial.published;

  const setRow = (k: number, field: keyof Omit<Row, 'key'>, value: string) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, [field]: value } : r)));

  function payload() {
    const citations = rows
      .filter((r) => r.title.trim() || r.source.trim() || r.url.trim())
      .map((r) => ({ title: r.title.trim(), source: r.source.trim(), ...(r.year.trim() ? { year: Number(r.year) } : {}), ...(r.url.trim() ? { url: r.url.trim() } : {}) }));
    const base = { title: title.trim(), summary: summary.trim(), body, citations };
    if (locked) return base;
    return { ...base, kind, treatmentKey, specialtyKey, ...(coverFileId || initial.id ? { coverFileId } : {}) };
  }

  async function save(): Promise<string | null> {
    setNotice(null);
    if (!initial.id) {
      const { treatmentKey: t, specialtyKey: s, coverFileId: c, ...rest } = payload() as ReturnType<typeof payload> & { treatmentKey?: string; specialtyKey?: string; coverFileId?: string };
      const result = await api.post<{ articleId: string }>('/api/v1/articles', { ...rest, ...(t ? { treatmentKey: t } : {}), ...(s ? { specialtyKey: s } : {}), ...(c ? { coverFileId: c } : {}) }, { idempotencyKey: createKey });
      if (!result.ok) {
        setNotice({ tone: 'danger', text: result.message });
        return null;
      }
      router.push(`/account/articles/${result.data.articleId}`);
      return null;
    }
    const result = await api.patch(`/api/v1/articles/${initial.id}`, payload());
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return null;
    }
    return initial.id;
  }

  async function onSave() {
    setBusy('save');
    const id = await save();
    setBusy(null);
    if (id) {
      setNotice({ tone: 'success', text: locked ? 'Saved. Readers keep seeing the reviewed version until you send this for review and it is approved.' : 'Saved.' });
      router.refresh();
    }
  }

  async function onSubmit() {
    setBusy('submit');
    const id = await save();
    if (!id) return setBusy(null);
    const result = await api.post(`/api/v1/articles/${id}/submit`, {});
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: 'Sent for review. You will be told when a reviewer has read it.' });
    router.refresh();
  }

  async function onArchive(event: React.FormEvent) {
    event.preventDefault();
    if (!initial.id) return;
    setBusy('archive');
    const result = await api.post(`/api/v1/articles/${initial.id}/archive`, { reason: reason.trim() });
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    router.refresh();
  }

  async function onCover(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy('cover');
    const form = new FormData();
    form.set('file', file);
    form.set('purpose', 'CONTENT_MEDIA');
    const result = await api.upload<{ id: string }>('/api/v1/files', form);
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setCoverFileId(result.data.id);
  }

  if (initial.archived) return <p className="tl-muted">This article is archived.</p>;

  return (
    <div className="tl-form">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Kind">
          {(props) => (
            <select {...props} className="tl-input" value={kind} disabled={locked} onChange={(e) => setKind(e.target.value)}>
              {ARTICLE_KINDS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Treatment it explains (optional)">
          {(props) => (
            <select {...props} className="tl-input" value={treatmentKey} disabled={locked} onChange={(e) => setTreatmentKey(e.target.value)}>
              <option value="">None</option>
              {treatments.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Specialty (optional)">
          {(props) => (
            <select {...props} className="tl-input" value={specialtyKey} disabled={locked} onChange={(e) => setSpecialtyKey(e.target.value)}>
              <option value="">None</option>
              {specialties.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="Title">{(props) => <Input {...props} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <Field label="Summary" hint="One or two sentences shown in lists and search results.">
        {(props) => <textarea {...props} className="tl-input" rows={2} maxLength={300} value={summary} onChange={(e) => setSummary(e.target.value)} />}
      </Field>
      <Field label="Text" hint="Plain text. A blank line between paragraphs; start a line with “## ” for a heading and “- ” for a list item. No links here — put them in the sources.">
        {(props) => <textarea {...props} className="tl-input" rows={16} maxLength={30000} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>

      <fieldset className="tl-stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>
          <strong>Sources</strong> {CLINICAL_KINDS.has(kind) ? <span className="tl-muted">— at least one for a clinical article</span> : <span className="tl-muted">— optional for a blog post</span>}
        </legend>
        <ol className="tl-list" aria-label="Sources">
          {rows.map((r, index) => (
            <li key={r.key} className="tl-stack" aria-label={`Source ${index + 1}`}>
              <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="Source title">{(props) => <Input {...props} maxLength={300} value={r.title} onChange={(e) => setRow(r.key, 'title', e.target.value)} />}</Field>
                <Field label="Published in">{(props) => <Input {...props} maxLength={200} value={r.source} onChange={(e) => setRow(r.key, 'source', e.target.value)} />}</Field>
                <Field label="Year">{(props) => <Input {...props} inputMode="numeric" maxLength={4} value={r.year} onChange={(e) => setRow(r.key, 'year', e.target.value.replace(/\D/g, ''))} />}</Field>
              </div>
              <Field label="Web address (optional)">{(props) => <Input {...props} type="url" maxLength={500} value={r.url} onChange={(e) => setRow(r.key, 'url', e.target.value)} />}</Field>
              {rows.length > 1 ? (
                <div>
                  <Button type="button" variant="ghost" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                    Remove this source
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        {rows.length < 30 ? (
          <div>
            <Button type="button" variant="secondary" onClick={() => setRows((rs) => [...rs, { key: Math.max(...rs.map((x) => x.key)) + 1, title: '', source: '', year: '', url: '' }])}>
              Add a source
            </Button>
          </div>
        ) : null}
      </fieldset>

      <Field label="Cover image (optional)" hint={locked ? 'Fixed once published.' : 'JPEG, PNG or WebP. Shown publicly with the article.'}>
        {(props) => <input {...props} type="file" accept=".jpg,.jpeg,.png,.webp" disabled={locked || busy === 'cover'} onChange={onCover} />}
      </Field>
      {coverFileId ? (
        // eslint-disable-next-line @next/next/no-img-element -- a public file served by our own route
        <img src={`/api/v1/files/${coverFileId}/public`} alt="Cover preview" style={{ maxWidth: '16rem', borderRadius: 8 }} />
      ) : null}

      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" loading={busy === 'save'} onClick={onSave}>
          {initial.id ? 'Save' : 'Save draft'}
        </Button>
        {initial.id && initial.canSubmit ? (
          <Button type="button" loading={busy === 'submit'} onClick={onSubmit}>
            Save and send for review
          </Button>
        ) : null}
        {initial.id && !archiving ? (
          <Button type="button" variant="ghost" onClick={() => setArchiving(true)}>
            Archive
          </Button>
        ) : null}
      </div>
      {archiving ? (
        <form onSubmit={onArchive} className="tl-form" noValidate>
          <Field label="Why archive it?">{(props) => <Input {...props} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <div className="tl-inline">
            <Button type="submit" variant="secondary" loading={busy === 'archive'} disabled={reason.trim().length < 5}>
              Archive article
            </Button>
            <Button type="button" variant="ghost" onClick={() => setArchiving(false)}>
              Keep it
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
