/**
 * "Use my location".
 *
 * The browser asks for permission only when this is clicked — never on page
 * load. The position is rounded to three decimal places (about 100 m), used
 * for this one search, and stored nowhere: it travels in the URL of the
 * search the person asked for, and in no cookie, profile or log we keep.
 */

'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/design-system';

export function UseMyLocation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<'idle' | 'asking' | 'denied' | 'unavailable'>('idle');

  function locate() {
    if (!('geolocation' in navigator)) return setState('unavailable');
    setState('asking');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('lat', position.coords.latitude.toFixed(3));
        params.set('lng', position.coords.longitude.toFixed(3));
        params.delete('near');
        params.delete('cursor');
        setState('idle');
        router.push(`${pathname}?${params.toString()}`);
      },
      (error) => setState(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <span className="tl-inline">
      <Button type="button" size="sm" variant="secondary" loading={state === 'asking'} onClick={locate}>
        Use my location
      </Button>
      {state === 'denied' ? (
        <span className="tl-muted" role="status">
          Location permission was declined. Type a city or area instead.
        </span>
      ) : null}
      {state === 'unavailable' ? (
        <span className="tl-muted" role="status">
          Your location is not available. Type a city or area instead.
        </span>
      ) : null}
    </span>
  );
}
