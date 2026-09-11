'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

interface Consent {
  purpose: string;
  granted: boolean;
  /** Already formatted for display on the server. */
  grantedAt: string | null;
}

const CONSENT_COPY: Record<string, { title: string; body: string }> = {
  MARKETING_EMAIL: { title: 'News and offers by email', body: 'Occasional product news and offers from Toothlogy. Never from third parties.' },
  MARKETING_SMS: { title: 'News and offers by SMS', body: 'Rare, short messages about offers near you.' },
  MARKETING_WHATSAPP: { title: 'News and offers on WhatsApp', body: 'The same, on WhatsApp.' },
  ANALYTICS_TRACKING: {
    title: 'Product analytics',
    body: 'Anonymous usage measurements that help us improve Toothlogy. Never includes your health information.',
  },
  AI_TRAINING: {
    title: 'Improving Toothlogy’s AI features',
    body: 'Allow de-identified use of your interactions to evaluate AI features. Off unless you turn it on; clinical records are never used.',
  },
};

export function PrivacyClient({ consents, graceDays }: { consents: Consent[]; graceDays: number }) {
  const router = useRouter();
  const [state, setState] = useState(consents);
  const [error, setError] = useState<string | null>(null);

  const setConsent = async (purpose: string, granted: boolean) => {
    setError(null);
    const r = await api.post<{ consents: Consent[] }>('/api/v1/me/consents', { purpose, granted });
    if (r.ok) setState(r.data.consents);
    else setError(r.message);
  };

  const deletion = useForm({
    initialValues: { password: '', confirm: '', reason: '' },
    validate: (v) => {
      const e: Record<string, string> = {};
      if (!v.password) e.password = 'Enter your password.';
      if (v.confirm !== 'DELETE') e.confirm = 'Type DELETE in capitals to confirm.';
      return e;
    },
    submit: (v) =>
      api.post<{ scheduledFor: string }>('/api/v1/me/deletion', {
        password: v.password,
        confirm: v.confirm,
        reason: v.reason.trim() || undefined,
      }),
    onSuccess: () => {
      router.push('/login?deleted=1');
      router.refresh();
    },
  });

  return (
    <div className="tl-account-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card label="What you allow">
        <CardHeader>
          <strong>What you allow</strong>
        </CardHeader>
        <CardBody>
          <p className="tl-muted" style={{ marginBlockStart: 0 }}>
            Messages about bookings, your account and its security are part of the service and do not need consent.
            Everything below is optional and off unless you turn it on.
          </p>
          <ul className="tl-list">
            {state.map((c) => (
              <li key={c.purpose}>
                <label className="tl-checkbox">
                  <input type="checkbox" checked={c.granted} onChange={(e) => void setConsent(c.purpose, e.target.checked)} />
                  <span>
                    <strong>{CONSENT_COPY[c.purpose]?.title ?? c.purpose}</strong>
                    <span className="tl-list__meta" style={{ display: 'block' }}>
                      {CONSENT_COPY[c.purpose]?.body}
                      {c.granted && c.grantedAt ? ` Given ${c.grantedAt}.` : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card label="Your data">
        <CardHeader>
          <strong>A copy of your data</strong>
        </CardHeader>
        <CardBody>
          <p className="tl-muted" style={{ marginBlockStart: 0 }}>
            Download everything Toothlogy holds about you — account, preferences, consents, security history,
            files you uploaded and notifications — as a JSON file you can keep or take elsewhere.
          </p>
          <a className="tl-button tl-button--secondary tl-button--md" href="/api/v1/me/export" download>
            Download my data
          </a>
        </CardBody>
      </Card>

      <Card label="Delete your account">
        <CardHeader>
          <strong>Delete your account</strong>
        </CardHeader>
        <CardBody>
          <p style={{ marginBlockStart: 0 }}>
            Your account is closed at once and every device is signed out. Your personal data is erased after{' '}
            {graceDays} days; until then you can change your mind by signing in and choosing “Restore my account”.
          </p>
          <p className="tl-muted">
            Some records must be kept by law after erasure — invoices, and clinical records a clinic is required to
            retain — but they are no longer linked to your name.
          </p>
          <form className="tl-form" onSubmit={deletion.handleSubmit} noValidate>
            {deletion.formError ? <Alert tone="danger">{deletion.formError}</Alert> : null}
            <Field label="Why are you leaving? (optional)">
              {(props) => (
                <Input {...props} value={deletion.values.reason} maxLength={1000} onChange={(e) => deletion.setValue('reason', e.target.value)} />
              )}
            </Field>
            <Field label="Your password" required error={deletion.fieldErrors.password}>
              {(props) => (
                <Input {...props} type="password" autoComplete="current-password" value={deletion.values.password} onChange={(e) => deletion.setValue('password', e.target.value)} />
              )}
            </Field>
            <Field label="Type DELETE to confirm" required error={deletion.fieldErrors.confirm}>
              {(props) => (
                <Input {...props} autoComplete="off" value={deletion.values.confirm} onChange={(e) => deletion.setValue('confirm', e.target.value)} />
              )}
            </Field>
            <div>
              <Button type="submit" variant="danger" loading={deletion.submitting}>
                Delete my account
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
