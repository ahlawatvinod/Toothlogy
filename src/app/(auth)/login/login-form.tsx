/**
 * Sign-in form: password, then — for accounts with two-step verification — a
 * code from the authenticator app or a recovery code.
 *
 * One `identifier` field accepting either an email or a phone number, rather
 * than a toggle. The server already resolves both, and asking the user to first
 * declare which kind of credential they are about to type is a step that exists
 * only for the implementation's convenience.
 *
 * The error message is deliberately identical for a wrong password and an
 * unknown account, mirroring the server. A helpful "no account with that email"
 * would turn this form into an account-enumeration oracle.
 *
 * The second step never navigates until the server confirms a session. The
 * challenge itself is an HttpOnly cookie this component cannot see.
 */

'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, type ApiResult } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

type LoginResponse =
  | { mfaRequired: true; expiresAt: string }
  | { mfaRequired: false; userId: string };

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /*
   * Only same-origin relative paths are honoured as a post-login destination.
   * An unvalidated `next` parameter is an open redirect: an attacker sends
   * `/login?next=https://evil.example` and the victim lands on a convincing
   * fake immediately after authenticating.
   */
  const requestedNext = searchParams.get('next');
  const next =
    requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/account';

  const [step, setStep] = useState<'password' | 'mfa'>('password');
  const [restorable, setRestorable] = useState<{ scheduledFor: string } | null>(null);
  const credentials = useRef({ identifier: '', password: '' });

  const finish = (data: LoginResponse) => {
    if (data.mfaRequired) {
      setStep('mfa');
      return;
    }
    router.push(next);
    router.refresh();
  };

  const form = useForm({
    initialValues: { identifier: '', password: '' },

    validate: (values) => {
      const errors: Record<string, string> = {};
      if (!values.identifier.trim()) errors.identifier = 'Enter your email or phone number.';
      if (!values.password) errors.password = 'Enter your password.';
      return errors;
    },

    submit: async (values): Promise<ApiResult<LoginResponse>> => {
      credentials.current = { identifier: values.identifier.trim(), password: values.password };
      setRestorable(null);
      const result = await api.post<LoginResponse>('/api/v1/auth/login', credentials.current);
      if (!result.ok && result.code === 'PRECONDITION_FAILED' && result.details?.restorable) {
        setRestorable({ scheduledFor: String(result.details.scheduledFor ?? '') });
      }
      return result;
    },

    onSuccess: finish,
  });

  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const restore = async () => {
    setRestoring(true);
    setRestoreError(null);
    const result = await api.post<LoginResponse>('/api/v1/auth/restore', credentials.current);
    setRestoring(false);
    if (result.ok) {
      setRestorable(null);
      finish(result.data);
    } else {
      setRestoreError(result.message);
    }
  };

  if (step === 'mfa') return <MfaStep onDone={() => { router.push(next); router.refresh(); }} onRestart={() => setStep('password')} />;

  return (
    <form onSubmit={form.handleSubmit} noValidate className="tl-form">
      {restorable ? (
        <Alert tone="warning" title="This account is scheduled for deletion">
          <p style={{ margin: '0 0 var(--tl-space-3)' }}>
            It will be deleted
            {restorable.scheduledFor
              ? ` on ${new Date(restorable.scheduledFor).toLocaleDateString(undefined, { dateStyle: 'long' })}`
              : ' soon'}
            . Restore it to cancel the deletion and sign in.
          </p>
          <Button type="button" variant="secondary" size="sm" loading={restoring} onClick={restore}>
            Restore my account
          </Button>
          {restoreError ? <p className="tl-field__error" role="alert">{restoreError}</p> : null}
        </Alert>
      ) : form.formError ? (
        <Alert tone="danger" title="Could not sign you in">
          {form.formError}
          {form.requestId ? (
            <>
              {' '}
              <span className="tl-form__reference">Reference: {form.requestId}</span>
            </>
          ) : null}
        </Alert>
      ) : null}

      <Field label="Email or phone number" required error={form.fieldErrors.identifier}>
        {(props) => (
          <Input
            {...props}
            autoComplete="username"
            autoFocus
            value={form.values.identifier}
            onChange={(e) => form.setValue('identifier', e.target.value)}
          />
        )}
      </Field>

      <Field label="Password" required error={form.fieldErrors.password}>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="current-password"
            value={form.values.password}
            onChange={(e) => form.setValue('password', e.target.value)}
          />
        )}
      </Field>

      <Button type="submit" fullWidth size="lg" loading={form.submitting}>
        Sign in
      </Button>

      <p className="tl-form__aside">
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
      <p className="tl-form__aside">
        New to Toothlogy? <Link href="/register">Create an account</Link>
      </p>
    </form>
  );
}

/** Second step: a code from the authenticator app, or a recovery code. */
function MfaStep({ onDone, onRestart }: { onDone: () => void; onRestart: () => void }) {
  const [useRecovery, setUseRecovery] = useState(false);

  const form = useForm({
    initialValues: { code: '' },
    validate: (values) => {
      const v = values.code.trim();
      if (useRecovery ? v.replace(/[^0-9A-Za-z]/g, '').length < 10 : !/^\d{6}$/.test(v)) {
        return { code: useRecovery ? 'Enter a recovery code, e.g. ABCDE-FGHJK.' : 'Enter the 6-digit code from your app.' };
      }
      return {};
    },
    submit: (values) =>
      api.post('/api/v1/auth/mfa/verify', useRecovery ? { recoveryCode: values.code.trim() } : { code: values.code.trim() }),
    onSuccess: onDone,
  });

  const expired = form.fieldErrors.challenge || /expired/i.test(form.formError ?? '');

  return (
    <form onSubmit={form.handleSubmit} noValidate className="tl-form">
      <p className="tl-auth__subtitle" style={{ margin: 0 }}>
        {useRecovery
          ? 'Enter one of the recovery codes you saved when you turned on two-step verification. Each code works once.'
          : 'Open your authenticator app and enter the 6-digit code for Toothlogy.'}
      </p>

      {expired ? (
        <Alert tone="warning" title="This sign-in has expired">
          For your security the code step lasts five minutes.{' '}
          <button type="button" className="tl-link-button" onClick={onRestart}>
            Enter your password again
          </button>
          .
        </Alert>
      ) : form.formError ? (
        <Alert tone="danger" title="Could not verify">{form.formError}</Alert>
      ) : null}

      <Field
        label={useRecovery ? 'Recovery code' : 'Authentication code'}
        required
        error={form.fieldErrors.code}
      >
        {(props) => (
          <Input
            {...props}
            autoFocus
            autoComplete={useRecovery ? 'off' : 'one-time-code'}
            inputMode={useRecovery ? 'text' : 'numeric'}
            maxLength={useRecovery ? 20 : 6}
            value={form.values.code}
            onChange={(e) => form.setValue('code', e.target.value)}
          />
        )}
      </Field>

      <Button type="submit" fullWidth size="lg" loading={form.submitting}>
        Verify and sign in
      </Button>

      <p className="tl-form__aside">
        <button
          type="button"
          className="tl-link-button"
          onClick={() => {
            setUseRecovery(!useRecovery);
            form.reset();
          }}
        >
          {useRecovery ? 'Use a code from your app instead' : 'Lost your phone? Use a recovery code'}
        </button>
      </p>
    </form>
  );
}
