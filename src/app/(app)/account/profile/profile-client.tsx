'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

interface ProfileUser {
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  avatarFileId: string | null;
}

/** Plain-language outcome of a delivery attempt. Never "sent" unless it was. */
function deliveryMessage(channel: 'email' | 'SMS', sent: boolean, reason: string | null): { tone: 'success' | 'warning'; text: string } {
  if (sent) return { tone: 'success', text: `Sent. Check your ${channel === 'email' ? 'inbox' : 'messages'}.` };
  if (reason === 'NOT_CONFIGURED') {
    return {
      tone: 'warning',
      text: `${channel === 'email' ? 'Email' : 'SMS'} delivery is not set up on this Toothlogy server yet, so nothing was sent. Nothing is wrong with your details.`,
    };
  }
  return { tone: 'warning', text: `We could not send the ${channel} (${reason ?? 'unknown error'}). Try again later.` };
}

export function ProfileClient({
  user,
  delivery,
}: {
  user: ProfileUser;
  delivery: { email: boolean; sms: boolean };
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="tl-account-stack">
      <PhotoCard avatarFileId={user.avatarFileId} name={user.displayName} onChange={refresh} />
      <NameCard displayName={user.displayName} onSaved={refresh} />
      <EmailCard email={user.email} verified={user.emailVerified} canSend={delivery.email} onChange={refresh} />
      <PhoneCard phone={user.phone} verified={user.phoneVerified} canSend={delivery.sms} onChange={refresh} />
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';
}

function PhotoCard({ avatarFileId, name, onChange }: { avatarFileId: string | null; name: string; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set('file', file);
    form.set('purpose', 'AVATAR');
    const uploaded = await api.upload<{ id: string }>('/api/v1/files', form, { idempotencyKey: newIdempotencyKey() });
    if (!uploaded.ok) {
      setBusy(false);
      setError(uploaded.fieldErrors.file ?? uploaded.message);
      return;
    }
    const saved = await api.patch('/api/v1/me/profile', { avatarFileId: uploaded.data.id });
    setBusy(false);
    if (saved.ok) onChange();
    else setError(saved.message);
  };

  const remove = async () => {
    setBusy(true);
    const saved = await api.patch('/api/v1/me/profile', { avatarFileId: null });
    setBusy(false);
    if (saved.ok) onChange();
    else setError(saved.message);
  };

  return (
    <Card label="Profile photo">
      <CardHeader>
        <strong>Photo</strong>
      </CardHeader>
      <CardBody>
        <div className="tl-inline">
          {avatarFileId ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by our own authorized file route
            <img className="tl-avatar tl-avatar--lg" src={`/api/v1/files/${avatarFileId}/public`} alt="" />
          ) : (
            <span className="tl-avatar tl-avatar--lg" aria-hidden="true">
              {initials(name)}
            </span>
          )}
          <div className="tl-inline">
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="tl-visually-hidden"
              aria-label="Choose a profile photo"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = '';
              }}
            />
            <Button variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>
              {avatarFileId ? 'Change photo' : 'Upload a photo'}
            </Button>
            {avatarFileId ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={remove}>
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        <p className="tl-muted" style={{ marginBlockEnd: 0 }}>
          JPEG, PNG or WebP, up to 5 MB. Your photo can be shown to dentists you book with.
        </p>
        {error ? (
          <Alert tone="danger" title="Could not update your photo">
            {error}
          </Alert>
        ) : null}
      </CardBody>
    </Card>
  );
}

function NameCard({ displayName, onSaved }: { displayName: string; onSaved: () => void }) {
  const form = useForm({
    initialValues: { displayName },
    validate: (v) => (v.displayName.trim() ? {} : { displayName: 'Enter your name.' }),
    submit: (v) => api.patch('/api/v1/me/profile', { displayName: v.displayName.trim() }),
    onSuccess: onSaved,
  });

  return (
    <Card label="Name">
      <CardHeader>
        <strong>Name</strong>
      </CardHeader>
      <CardBody>
        <form className="tl-form" onSubmit={form.handleSubmit} noValidate>
          {form.succeeded ? <Alert tone="success">Saved.</Alert> : null}
          {form.formError ? <Alert tone="danger">{form.formError}</Alert> : null}
          <Field label="Your name" required hint="As you would like dentists and clinics to address you." error={form.fieldErrors.displayName}>
            {(props) => (
              <Input {...props} autoComplete="name" value={form.values.displayName} onChange={(e) => form.setValue('displayName', e.target.value)} />
            )}
          </Field>
          <div>
            <Button type="submit" loading={form.submitting}>
              Save name
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function EmailCard({
  email,
  verified,
  canSend,
  onChange,
}: {
  email: string | null;
  verified: boolean;
  canSend: boolean;
  onChange: () => void;
}) {
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const [resending, setResending] = useState(false);
  const [changing, setChanging] = useState(false);

  const resend = async () => {
    setResending(true);
    const result = await api.post<{ sent: boolean; reason: string | null }>('/api/v1/auth/verify/resend');
    setResending(false);
    setNotice(result.ok ? deliveryMessage('email', result.data.sent, result.data.reason) : { tone: 'warning', text: result.message });
  };

  const form = useForm({
    initialValues: { newEmail: '', password: '' },
    validate: (v) => {
      const e: Record<string, string> = {};
      if (!/^\S+@\S+\.\S+$/.test(v.newEmail.trim())) e.newEmail = 'Enter a valid email address.';
      if (!v.password) e.password = 'Enter your password.';
      return e;
    },
    submit: (v) => api.post<{ sent: boolean; reason: string | null }>('/api/v1/me/email', { newEmail: v.newEmail.trim(), password: v.password }),
    onSuccess: (data) => {
      setNotice(
        data.sent
          ? { tone: 'success', text: 'We sent a link to the new address. Your email changes when you open it.' }
          : deliveryMessage('email', false, data.reason),
      );
      setChanging(false);
      onChange();
    },
  });

  return (
    <Card label="Email address">
      <CardHeader>
        <div className="tl-card__title-row">
          <strong>Email</strong>
          {email ? verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge> : null}
        </div>
      </CardHeader>
      <CardBody>
        <p style={{ marginBlockStart: 0 }}>{email ?? <span className="tl-muted">No email address on your account.</span>}</p>
        {email && !verified ? (
          <p className="tl-muted">
            Until it is verified, appointment confirmations and reminders are not sent to this address.
          </p>
        ) : null}
        {!canSend ? (
          <Alert tone="info" title="Email is not set up on this server">
            Verification and notification emails cannot be sent until an email provider is configured. In-app
            notifications still work.
          </Alert>
        ) : null}
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

        <div className="tl-inline">
          {email && !verified ? (
            <Button variant="secondary" size="sm" loading={resending} onClick={resend}>
              Send verification link
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setChanging(!changing)} aria-expanded={changing}>
            {changing ? 'Cancel' : email ? 'Change email' : 'Add an email'}
          </Button>
        </div>

        {changing ? (
          <form className="tl-form" onSubmit={form.handleSubmit} noValidate style={{ marginBlockStart: 'var(--tl-space-4)' }}>
            {form.formError ? <Alert tone="danger">{form.formError}</Alert> : null}
            <Field label="New email address" required error={form.fieldErrors.newEmail}>
              {(props) => (
                <Input {...props} type="email" autoComplete="email" value={form.values.newEmail} onChange={(e) => form.setValue('newEmail', e.target.value)} />
              )}
            </Field>
            <Field label="Your password" required hint="Required so an unattended device cannot redirect your account’s email." error={form.fieldErrors.password}>
              {(props) => (
                <Input {...props} type="password" autoComplete="current-password" value={form.values.password} onChange={(e) => form.setValue('password', e.target.value)} />
              )}
            </Field>
            <div>
              <Button type="submit" loading={form.submitting}>
                Send confirmation link
              </Button>
            </div>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}

function PhoneCard({
  phone,
  verified,
  canSend,
  onChange,
}: {
  phone: string | null;
  verified: boolean;
  canSend: boolean;
  onChange: () => void;
}) {
  const [stage, setStage] = useState<'idle' | 'enter' | 'code'>('idle');
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);

  const request = useForm({
    initialValues: { phone: phone ?? '' },
    validate: (v) => (/^\+[1-9]\d{6,14}$/.test(v.phone.replace(/\s+/g, '')) ? {} : { phone: 'Use international format, e.g. +91 98765 43210.' }),
    submit: (v) => api.post<{ sent: boolean; reason: string | null }>('/api/v1/auth/phone', { action: 'request', phone: v.phone.replace(/\s+/g, '') }),
    onSuccess: (data) => {
      setNotice(deliveryMessage('SMS', data.sent, data.reason));
      setStage('code');
    },
  });

  const confirm = useForm({
    initialValues: { code: '' },
    validate: (v) => (/^\d{6}$/.test(v.code.trim()) ? {} : { code: 'Enter the 6-digit code.' }),
    submit: (v) => api.post('/api/v1/auth/phone', { action: 'confirm', code: v.code.trim() }),
    onSuccess: () => {
      setNotice({ tone: 'success', text: 'Your phone number is verified.' });
      setStage('idle');
      onChange();
    },
  });

  return (
    <Card label="Phone number">
      <CardHeader>
        <div className="tl-card__title-row">
          <strong>Phone</strong>
          {phone ? verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge> : null}
        </div>
      </CardHeader>
      <CardBody>
        <p style={{ marginBlockStart: 0 }}>{phone ?? <span className="tl-muted">No phone number on your account.</span>}</p>
        {!canSend ? (
          <Alert tone="info" title="SMS is not set up on this server">
            Verification codes cannot be sent by SMS until an SMS provider is configured, so a phone number cannot be
            verified yet.
          </Alert>
        ) : null}
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

        {stage === 'idle' ? (
          <Button variant="secondary" size="sm" onClick={() => setStage('enter')}>
            {phone && !verified ? 'Verify this number' : phone ? 'Change number' : 'Add a phone number'}
          </Button>
        ) : null}

        {stage === 'enter' ? (
          <form className="tl-form" onSubmit={request.handleSubmit} noValidate>
            {request.formError ? <Alert tone="danger">{request.formError}</Alert> : null}
            <Field label="Mobile number" required hint="Include the country code, e.g. +91." error={request.fieldErrors.phone}>
              {(props) => (
                <Input {...props} type="tel" autoComplete="tel" inputMode="tel" value={request.values.phone} onChange={(e) => request.setValue('phone', e.target.value)} />
              )}
            </Field>
            <div className="tl-inline">
              <Button type="submit" loading={request.submitting}>
                Send code
              </Button>
              <Button variant="ghost" onClick={() => setStage('idle')}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {stage === 'code' ? (
          <form className="tl-form" onSubmit={confirm.handleSubmit} noValidate>
            {confirm.formError ? <Alert tone="danger">{confirm.formError}</Alert> : null}
            <Field label="6-digit code" required error={confirm.fieldErrors.code}>
              {(props) => (
                <Input {...props} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={confirm.values.code} onChange={(e) => confirm.setValue('code', e.target.value)} />
              )}
            </Field>
            <div className="tl-inline">
              <Button type="submit" loading={confirm.submitting}>
                Verify
              </Button>
              <Button variant="ghost" onClick={() => setStage('enter')}>
                Send a new code
              </Button>
            </div>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}
