/**
 * TL-PAGE-ACCOUNT-PREFS-001 — /account/preferences
 *
 * Region and language, appearance, accessibility, quiet hours, search
 * defaults and saved places. Options come from the registry, so the page can
 * only offer what the platform can actually honour.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { getPreferences, listSavedLocations } from '@/platform/users/preferences';
import { COUNTRIES, CURRENCIES, LANGUAGES, TIMEZONES } from '@/registry/globalization';
import { PreferencesClient } from './preferences-client';

export const metadata: Metadata = { title: 'Preferences', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Languages with an interface catalogue — the only ones worth offering. */
const UI_LANGUAGES = new Set(['en', 'hi']);

export default async function PreferencesPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/preferences');

  const [prefs, places] = await Promise.all([
    getPreferences(principal.userId),
    listSavedLocations(principal.userId),
  ]);

  // ICU lists some zones under legacy canonical names (Asia/Calcutta rather
  // than Asia/Kolkata). The saved value and the registry's zones are always
  // included, so the select can never silently show a different zone than
  // the one actually saved.
  const timezones = [
    ...new Set([
      prefs.timezone,
      ...TIMEZONES.map((t) => t.id),
      ...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []),
    ]),
  ].sort();

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>Preferences</h1>
        <p className="tl-page__lead">Language, region, appearance and when we may interrupt you.</p>
      </header>
      <PreferencesClient
        initial={prefs}
        places={places}
        options={{
          languages: LANGUAGES.filter((l) => l.enabled && UI_LANGUAGES.has(l.code)).map((l) => ({
            code: l.code,
            label: l.name === l.nativeName ? l.name : `${l.nativeName} (${l.name})`,
          })),
          countries: COUNTRIES.map((c) => ({ code: c.code, label: c.name, enabled: c.enabled })),
          currencies: CURRENCIES.map((c) => ({ code: c.code, label: `${c.code} — ${c.name}` })),
          timezones,
        }}
      />
    </div>
  );
}
