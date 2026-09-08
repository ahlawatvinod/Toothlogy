/**
 * TL-PAGE-LOGIN-001 — /login
 */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { LoadingState } from '@/design-system';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Toothlogy.',
  robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (isAuthenticated(await currentPrincipal())) redirect('/account');

  return (
    <>
      <h1 className="tl-auth__title">Sign in</h1>
      <p className="tl-auth__subtitle">Welcome back.</p>
      {/*
       * useSearchParams needs a Suspense boundary: without one, Next.js opts the
       * whole route out of static rendering with a build-time warning.
       */}
      <Suspense fallback={<LoadingState label="Loading sign-in form…" />}>
        <LoginForm />
      </Suspense>
    </>
  );
}
