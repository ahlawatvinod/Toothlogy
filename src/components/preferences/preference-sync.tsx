'use client';

/**
 * Carries a signed-in user's saved presentation preferences onto this device.
 *
 * The theme script applies whatever the DEVICE last stored, before paint.
 * Preferences saved to the account on another device reach this one here:
 * after hydration the account values are written to local storage and applied,
 * so from the next navigation on they are there before first paint too.
 */

import { useEffect } from 'react';
import {
  applyPresentation,
  storePresentation,
  THEME_STORAGE_KEY,
  type StoredPresentation,
} from '@/design-system';

export interface AccountPresentation extends StoredPresentation {
  readonly theme: 'SYSTEM' | 'LIGHT' | 'DARK';
}

export function PreferenceSync({ prefs }: { prefs: AccountPresentation }) {
  useEffect(() => {
    const theme = prefs.theme === 'SYSTEM' ? 'system' : prefs.theme.toLowerCase();
    try {
      if (localStorage.getItem(THEME_STORAGE_KEY) !== theme) {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
        if (theme === 'system') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', theme);
      }
    } catch {
      // Storage unavailable: the theme still applies for this page.
    }
    const presentation: StoredPresentation = {
      palette: prefs.palette,
      contrast: prefs.contrast,
      motion: prefs.motion,
      textScale: prefs.textScale,
    };
    storePresentation(presentation);
    applyPresentation(presentation);
  }, [prefs]);

  return null;
}
