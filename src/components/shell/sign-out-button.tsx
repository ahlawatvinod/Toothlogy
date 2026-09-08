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
import { Button } from '@/design-system';
import { api } from '@/lib/api-client';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
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
