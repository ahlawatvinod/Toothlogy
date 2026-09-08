/**
 * TL-PAGE-REGISTER-001 — /register
 *
 * Redirects an already-signed-in visitor to their account. Showing a
 * registration form to someone who is signed in invites them to create a
 * duplicate account, and the resulting "email already in use" error is
 * confusing rather than helpful.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create your account',
  description:
    'Join Toothlogy as a patient, dentist, student or supplier. Find the right dental care, or be found by the patients who need you.',
  robots: { index: true, follow: true },
};

export const dynamic = 'force-dynamic';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  if (isAuthenticated(await currentPrincipal())) redirect('/account');

  const { role } = await searchParams;

  return (
    <>
      <h1 className="tl-auth__title">Create your account</h1>
      <p className="tl-auth__subtitle">
        One account for finding care, running a practice, learning and supplying.
      </p>
      <RegisterForm defaultRole={role} />
    </>
  );
}
