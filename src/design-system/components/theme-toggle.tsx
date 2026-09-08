/**
 * TL-CMP-THEMETOGGLE-001 — Theme toggle
 *
 * Three states, not two: light, dark, and **system**. System is the default and
 * must stay selectable — a user whose OS switches at sunset expects the site to
 * follow, and a two-state toggle silently overrides that preference.
 *
 * Implemented as a radiogroup rather than a cycling button, because a button
 * labelled "Theme" that cycles tells a screen-reader user neither the current
 * value nor the available options.
 *
 * The stored preference is read through `useSyncExternalStore` rather than an
 * effect that calls `setState`. Reading in an effect would render once with the
 * wrong value and then immediately re-render — a cascading render, and a visible
 * flicker of the wrong toggle state. `useSyncExternalStore` gives React a server
 * snapshot ('system') and a client snapshot (localStorage), so hydration is
 * consistent and the correct value appears on the first client render.
 *
 * It also subscribes to the `storage` event, so changing the theme in one tab
 * updates every other open tab — which falls out of the same API for free.
 *
 * The flash of the wrong *page* theme is handled separately by `themeScript`,
 * which runs before first paint.
 */

'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { cn } from '../lib/cn';

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'tl-theme';

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

/**
 * Same-tab listeners.
 *
 * The `storage` event fires only in *other* tabs, so a local set of listeners is
 * needed for the tab that made the change to re-render.
 */
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * Read the current preference.
 *
 * Returns a primitive, so React's `Object.is` comparison is stable across calls
 * and this cannot loop.
 */
function getSnapshot(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Private browsing and blocked site data both throw. The default is correct
    // in that case, so there is nothing to recover.
  }
  return 'system';
}

/** The server cannot know the visitor's choice, so it renders the default. */
function getServerSnapshot(): ThemePreference {
  return 'system';
}

function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') {
    // Removing the attribute hands control back to the prefers-color-scheme
    // media query in globals.css.
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const choose = useCallback((next: ThemePreference) => {
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The preference simply does not persist. Not worth failing the
      // interaction over — the theme still applies for this session.
    }
    notifyListeners();
  }, []);

  return (
    <div className={cn('tl-theme-toggle', className)} role="radiogroup" aria-label="Theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={preference === option.value}
          className={cn(
            'tl-theme-toggle__option',
            preference === option.value && 'tl-theme-toggle__option--active',
          )}
          onClick={() => choose(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
