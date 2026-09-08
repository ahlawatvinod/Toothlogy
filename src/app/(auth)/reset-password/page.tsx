/**
 * TL-PAGE-RESETPW-001 — /reset-password
 */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoadingState } from '@/design-system';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="tl-auth__title">Set a new password</h1>
      <p className="tl-auth__subtitle">
        Choose a new password. You will be signed out on all devices.
      </p>
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
