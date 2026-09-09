/**
 * Sign-out control.
 *
 * A POST rather than a link, because signing out changes state: a GET would be
 * prefetchable and could be triggered by any page that embeds an image pointing
 * at it — the classic logout-CSRF nuisance.
 *
 * `router.refresh()` after success re-renders the server components, so the
 * header updates without a full page load and without the client having to
 * duplicate the server's idea of who is signed in.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from '@/design-system';
import { api } from '@/lib/api-client';

export interface SignOutButtonProps {
  /** Defaults match the header bar; the mobile menu needs full-size controls. */
  readonly size?: ButtonSize;
  readonly variant?: ButtonVariant;
  readonly fullWidth?: boolean;
}

export function SignOutButton({
  size = 'sm',
  variant = 'ghost',
  fullWidth = false,
}: SignOutButtonProps = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await api.post('/api/v1/auth/logout', { allDevices: false });
        // Navigate first, then refresh, so the user is not left on a page they
        // can no longer see.
        router.push('/');
        router.refresh();
        setBusy(false);
      }}
    >
      Sign out
    </Button>
  );
}
