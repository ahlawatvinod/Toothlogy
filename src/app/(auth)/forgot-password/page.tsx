/**
 * TL-PAGE-FORGOT-001 — /forgot-password
 */

import type { Metadata } from 'next';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: true },
};

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="tl-auth__title">Reset your password</h1>
      <p className="tl-auth__subtitle">
        Enter your email address and we will send you a link to set a new password.
      </p>
      <ForgotPasswordForm />
    </>
  );
}
