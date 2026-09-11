'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/design-system';

/** Go back to where the visitor was, or home if there is nowhere to go back to. */
export function RetryButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      fullWidth
      onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
    >
      Try again
    </Button>
  );
}
