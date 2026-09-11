/**
 * TL-PAGE-ACTIVATE-001 — /activate
 *
 * Take over a profile Toothlogy prepared from public dental records. Without
 * a token: enter the email and mobile on the profile to receive a link and a
 * code. With the link's token: enter the code and choose a password. The
 * profile is the dentist's own from then on — never a second account.
 */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoadingState } from '@/design-system';
import { ActivateForm } from './activate-form';

export const metadata: Metadata = {
  title: 'Activate your profile',
  robots: { index: false, follow: false },
};

export default function ActivatePage() {
  return (
    <>
      <h1 className="tl-auth__title">Activate your profile</h1>
      <p className="tl-auth__subtitle">
        For dentists whose profile Toothlogy prepared from public records. Activation proves the email address and the mobile number on it.
      </p>
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <ActivateForm />
      </Suspense>
    </>
  );
}
