/**
 * TL-PAGE-WHICH-DENTIST-001 — /which-dentist
 *
 * "Which kind of dentist should I see?" Fixed rules — not AI, not a
 * diagnosis (Constitution §5). Safety questions first; then how soon, which
 * kind of dentist, and what the treatment pages explain, with a search for
 * that kind of dentist. The rules run in the browser: the answers are never
 * sent or stored.
 */

import type { Metadata } from 'next';
import { CONCERNS, EMERGENCY_NUMBERS, RED_FLAGS } from '@/platform/triage/rules';
import { DENTAL_SPECIALTIES } from '@/platform/dentists/specialties';
import { TREATMENT_BY_KEY } from '@/platform/catalogue/treatments';
import { ConcernRouter } from '@/components/triage/concern-router';

export const metadata: Metadata = {
  title: 'Which dentist should I see?',
  description: 'Answer a few questions to find which kind of dentist to see, and how soon. Guidance on where to go, not a diagnosis.',
};

export default function WhichDentistPage() {
  const specialtyNames = Object.fromEntries(DENTAL_SPECIALTIES.map((s) => [s.key, s.name]));
  const treatmentNames = Object.fromEntries([...TREATMENT_BY_KEY.values()].map((t) => [t.key, t.name]));

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '48rem' }}>
      <header className="tl-page__header">
        <h1>Which dentist should I see?</h1>
        <p className="tl-page__lead">
          A few questions about what is bothering you, and you will see how soon to be seen and which kind of dentist to look for. This is guidance on where to go, not a diagnosis. Your answers stay on this device.
        </p>
      </header>
      <ConcernRouter concerns={CONCERNS.map((c) => ({ key: c.key, label: c.label }))} redFlags={RED_FLAGS} emergencyNumber={EMERGENCY_NUMBERS.IN ?? null} specialtyNames={specialtyNames} treatmentNames={treatmentNames} />
    </div>
  );
}
