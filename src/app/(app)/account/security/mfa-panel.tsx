'use client';

/**
 * Two-step verification: set up, confirm, keep recovery codes, turn off.
 *
 * Recovery codes are shown exactly once, straight from the confirm response,
 * and never fetched again — the server only holds their hashes. The panel
 * makes that plain and offers printing, because a code that was never saved
 * is a locked-out user the day they lose their phone.
 *
 * No QR code is drawn: there is no QR encoder in the platform yet. The key is
 * shown in groups for manual entry, and the otpauth:// link opens the
 * authenticator app directly on the phone that has it.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

interface Status {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

type Stage = 'idle' | 'password' | 'scan' | 'codes' | 'disable' | 'regenerate';

const groups = (secret: string) => secret.match(/.{1,4}/g)?.join(' ') ?? secret;

export function MfaPanel({ status }: { status: Status }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [stage, setStage] = useState<Stage>('idle');
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  const start = useForm({
    initialValues: { password: '' },
    validate: (v) => (v.password ? {} : { password: 'Enter your password.' }),
    submit: (v) => api.post<{ secret: string; otpauthUri: string }>('/api/v1/auth/mfa/totp', { action: 'start', password: v.password }),
    onSuccess: (data) => {
      setSetup(data);
      setStage('scan');
      start.reset();
    },
  });

  const confirm = useForm({
    initialValues: { code: '' },
    validate: (v) => (/^\d{6}$/.test(v.code.trim()) ? {} : { code: 'Enter the 6-digit code your app shows.' }),
    submit: (v) => api.post<{ recoveryCodes: string[] }>('/api/v1/auth/mfa/totp', { action: 'confirm', code: v.code.trim() }),
    onSuccess: (data) => {
      setCodes(data.recoveryCodes);
      setSetup(null);
      setStage('codes');
      confirm.reset();
    },
  });

  const disable = useForm({
    initialValues: { password: '', code: '' },
    validate: (v) => {
      const e: Record<string, string> = {};
      if (!v.password) e.password = 'Enter your password.';
      if (!v.code.trim()) e.code = 'Enter a code from your app, or a recovery code.';
      return e;
    },
    submit: (v) => {
      const code = v.code.trim();
      return api.post('/api/v1/auth/mfa/totp', {
        action: 'disable',
        password: v.password,
        ...(/^\d{6}$/.test(code) ? { code } : { recoveryCode: code }),
      });
    },
    onSuccess: () => {
      setStage('idle');
      setNotice('Two-step verification is off. We sent a security alert to your account.');
      disable.reset();
      refresh();
    },
  });

  const regenerate = useForm({
    initialValues: { password: '' },
    validate: (v) => (v.password ? {} : { password: 'Enter your password.' }),
    submit: (v) => api.post<{ recoveryCodes: string[] }>('/api/v1/auth/mfa/recovery-codes', { password: v.password }),
    onSuccess: (data) => {
      setCodes(data.recoveryCodes);
      setStage('codes');
      regenerate.reset();
    },
  });

  return (
    <Card label="Two-step verification">
      <CardHeader>
        <div className="tl-card__title-row">
          <strong>Two-step verification</strong>
          {status.enabled ? <Badge tone="success">On</Badge> : <Badge tone="warning">Off</Badge>}
        </div>
      </CardHeader>
      <CardBody>
        {notice ? <Alert tone="success">{notice}</Alert> : null}

        {stage === 'idle' ? (
          status.enabled ? (
            <>
              <p style={{ marginBlockStart: 0 }}>
                Signing in needs your password and a code from your authenticator app
                {status.enabledAt ? ` (on since ${status.enabledAt})` : ''}.
              </p>
              <p className="tl-muted">
                {status.recoveryCodesRemaining} unused recovery code{status.recoveryCodesRemaining === 1 ? '' : 's'} left.
                {status.recoveryCodesRemaining <= 3 ? ' Generate new ones soon.' : ''}
              </p>
              <div className="tl-inline">
                <Button variant="secondary" size="sm" onClick={() => setStage('regenerate')}>
                  New recovery codes
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setStage('disable')}>
                  Turn off
                </Button>
              </div>
            </>
          ) : (
            <>
              <p style={{ marginBlockStart: 0 }}>
                Add a second step to signing in: a code from an authenticator app on your phone (Google Authenticator,
                Microsoft Authenticator, 1Password and others). Someone who learns your password still cannot get in.
              </p>
              <Button onClick={() => setStage('password')}>Set up two-step verification</Button>
            </>
          )
        ) : null}

        {stage === 'password' ? (
          <form className="tl-form" onSubmit={start.handleSubmit} noValidate>
            {start.formError ? <Alert tone="danger">{start.formError}</Alert> : null}
            <Field label="Confirm your password" required error={start.fieldErrors.password}>
              {(props) => (
                <Input {...props} type="password" autoComplete="current-password" value={start.values.password} onChange={(e) => start.setValue('password', e.target.value)} />
              )}
            </Field>
            <div className="tl-inline">
              <Button type="submit" loading={start.submitting}>
                Continue
              </Button>
              <Button variant="ghost" onClick={() => setStage('idle')}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {stage === 'scan' && setup ? (
          <form className="tl-form" onSubmit={confirm.handleSubmit} noValidate>
            <ol style={{ margin: 0, paddingInlineStart: '1.25rem', display: 'grid', gap: 'var(--tl-space-3)' }}>
              <li>
                In your authenticator app, add an account and choose to enter a key. Account: <strong>Toothlogy</strong>. Key:
                <div style={{ fontFamily: 'var(--tl-font-mono)', fontSize: 'var(--tl-text-lg)', marginBlock: 'var(--tl-space-2)', wordBreak: 'break-all' }}>
                  {groups(setup.secret)}
                </div>
                On the phone that has the app, you can instead{' '}
                <a href={setup.otpauthUri}>open this link to add it directly</a>.
              </li>
              <li>Enter the 6-digit code the app now shows for Toothlogy.</li>
            </ol>
            {confirm.formError ? <Alert tone="danger">{confirm.formError}</Alert> : null}
            <Field label="6-digit code" required error={confirm.fieldErrors.code}>
              {(props) => (
                <Input {...props} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={confirm.values.code} onChange={(e) => confirm.setValue('code', e.target.value)} />
              )}
            </Field>
            <div className="tl-inline">
              <Button type="submit" loading={confirm.submitting}>
                Turn on
              </Button>
              <Button variant="ghost" onClick={() => { setSetup(null); setStage('idle'); }}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {stage === 'codes' && codes ? (
          <div className="tl-form">
            <Alert tone="warning" title="Save these recovery codes now">
              Each code signs you in once if you lose your phone. They will not be shown again.
            </Alert>
            <ul className="tl-code-grid" aria-label="Recovery codes">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="tl-inline">
              <Button variant="secondary" onClick={() => window.print()}>
                Print
              </Button>
              <Button
                variant="secondary"
                onClick={() => void navigator.clipboard?.writeText(codes.join('\n'))}
              >
                Copy
              </Button>
              <Button
                onClick={() => {
                  setCodes(null);
                  setStage('idle');
                  setNotice('Two-step verification is on.');
                  refresh();
                }}
              >
                I have saved them
              </Button>
            </div>
          </div>
        ) : null}

        {stage === 'disable' ? (
          <form className="tl-form" onSubmit={disable.handleSubmit} noValidate>
            <Alert tone="warning">Turning this off makes your password the only thing protecting your account.</Alert>
            {disable.formError ? <Alert tone="danger">{disable.formError}</Alert> : null}
            <Field label="Your password" required error={disable.fieldErrors.password}>
              {(props) => (
                <Input {...props} type="password" autoComplete="current-password" value={disable.values.password} onChange={(e) => disable.setValue('password', e.target.value)} />
              )}
            </Field>
            <Field label="Code from your app, or a recovery code" required error={disable.fieldErrors.code}>
              {(props) => (
                <Input {...props} autoComplete="one-time-code" value={disable.values.code} onChange={(e) => disable.setValue('code', e.target.value)} />
              )}
            </Field>
            <div className="tl-inline">
              <Button type="submit" variant="danger" loading={disable.submitting}>
                Turn off two-step verification
              </Button>
              <Button variant="ghost" onClick={() => setStage('idle')}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {stage === 'regenerate' ? (
          <form className="tl-form" onSubmit={regenerate.handleSubmit} noValidate>
            <p className="tl-muted" style={{ margin: 0 }}>Your current recovery codes will stop working.</p>
            {regenerate.formError ? <Alert tone="danger">{regenerate.formError}</Alert> : null}
            <Field label="Your password" required error={regenerate.fieldErrors.password}>
              {(props) => (
                <Input {...props} type="password" autoComplete="current-password" value={regenerate.values.password} onChange={(e) => regenerate.setValue('password', e.target.value)} />
              )}
            </Field>
            <div className="tl-inline">
              <Button type="submit" loading={regenerate.submitting}>
                Generate new codes
              </Button>
              <Button variant="ghost" onClick={() => setStage('idle')}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}
