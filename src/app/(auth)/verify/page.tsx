/**
 * TL-PAGE-VERIFY-001 — /verify
 */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoadingState } from '@/design-system';
import { VerifyClient } from './verify-client';

export const metadata: Metadata = {
  title: 'Verify your email',
  robots: { index: false, follow: false },
};

export default function VerifyPage() {
  return (
    <>
      <h1 className="tl-auth__title">Verify your email</h1>
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <VerifyClient />
      </Suspense>
    </>
  );
}
