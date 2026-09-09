/**
 * TL-PAGE-HOME-001 — /
 *
 * The public entry point.
 *
 * It states what genuinely works today and what does not. That is not modesty
 * — a landing page advertising appointment booking that cannot book an
 * appointment converts a visitor into someone who distrusts the product
 * (Constitution P9).
 *
 * WHAT THIS PAGE DELIBERATELY DOES NOT HAVE
 * No search box, no dentist cards, no star ratings, no "10,000 patients
 * served". Discovery, booking and reviews are Phase 4 and 5. A search field
 * that returns nothing is worse on a health platform than no search field: a
 * patient who believes they searched and found nobody may conclude there is no
 * dentist near them. The same goes for an invented average rating — it is a
 * number a patient would actually act on.
 *
 * So the hero sells what the platform is for, and every number on the page is
 * read from the registry or the specialty list at render time rather than typed
 * in, which means none of them can drift from what the code actually contains.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { registrySummary } from '@/registry';
import { PILLARS } from '@/registry/types';
import { COUNTRIES, LANGUAGES } from '@/registry/globalization';
import { DENTAL_SPECIALTIES } from '@/platform/dentists/specialties';
import { Badge, Icon, type IconName } from '@/design-system';
import { LogoMark } from '@/components/brand/logo';
import { HeroTooth } from '@/components/brand/hero-tooth';
import { Reveal } from '@/components/motion/reveal';
import { Counter } from '@/components/motion/counter';
import { Feature, SectionHeading, Tile } from '@/components/site/sections';

export const metadata: Metadata = {
  title: 'Toothlogy — find the right dentist',
  description:
    'Toothlogy connects patients, dentists, clinics, colleges, students and suppliers. Find the right dentist at the right time, and give practices the tools to be found.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Toothlogy — find the right dentist',
    description:
      'A global dental ecosystem connecting patients, dentists, clinics, colleges, students and suppliers.',
    type: 'website',
  },
};

/**
 * Icons for the specialty cards.
 *
 * Kept here rather than in the platform module, because the platform layer does
 * not depend on the design system and the seed script loads that module too.
 * Unmapped keys fall back to the generic tooth glyph, so adding a specialty
 * produces a sensible card rather than an empty square.
 */
const SPECIALTY_ICONS: Readonly<Record<string, IconName>> = {
  general_dentistry: 'tooth',
  endodontics: 'heartPulse',
  orthodontics: 'scale',
  periodontics: 'shieldCheck',
  prosthodontics: 'sparkles',
  oral_surgery: 'clipboardCheck',
  pedodontics: 'users',
  oral_pathology: 'search',
  oral_radiology: 'globe',
  public_health_dentistry: 'building',
  implantology: 'graduationCap',
  cosmetic_dentistry: 'sparkles',
};

/** What the platform does for a patient, as it stands today. */
const WHY_TOOTHLOGY: ReadonlyArray<{ icon: IconName; title: string; text: string }> = [
  {
    icon: 'shieldCheck',
    title: 'Verified dentists, not claimed ones',
    text: 'Every qualification on a profile has been checked against the issuing council’s register. A dentist is not listed until that check passes, and verification can be revoked.',
  },
  {
    icon: 'scale',
    title: 'Merit ranks above spend',
    text: 'Paid placement is allowed; paid placement disguised as an organic result is not. Every promoted listing is labelled as one, on every surface — including the API.',
  },
  {
    icon: 'lock',
    title: 'Your records stay yours',
    text: 'Clinics and dentists hold access grants, not ownership. Access is explicit, revocable and audited, and export is a right rather than a feature request.',
  },
  {
    icon: 'globe',
    title: 'Built global from day one',
    text: 'Country, language, currency and timezone are inputs to every layer rather than constants. India is the first market, never an architectural assumption.',
  },
];

export default function HomePage() {
  const summary = registrySummary();
  const enabledLanguages = LANGUAGES.filter((language) => language.enabled).length;

  return (
    <>
      {/* ================= HERO ================= */}
      <section className="tl-hero" aria-labelledby="hero-heading">
        <div className="tl-container tl-hero__inner">
          <Reveal className="tl-hero__copy">
            <p className="tl-hero__badge">
              <span className="tl-hero__badge-dot" aria-hidden="true" />
              Better care · Healthier smiles · Brighter future
            </p>

            <h1 className="tl-hero__title" id="hero-heading">
              Help every good dentist be{' '}
              <span className="tl-gradient-text">found by the right patient</span>.
            </h1>

            <p className="tl-hero__lead">
              Toothlogy is a global dental ecosystem connecting patients, dentists, clinics,
              colleges, students and suppliers — built so competence is discoverable, not just
              marketing budgets.
            </p>

            <div className="tl-hero__actions">
              <Link className="tl-button tl-button--primary tl-button--lg" href="/register">
                Create an account
              </Link>
              <Link
                className="tl-button tl-button--secondary tl-button--lg"
                href="/register?role=dentist"
              >
                List your practice
              </Link>
            </div>

            <p className="tl-hero__note">
              Accounts, clinics and dentist verification are live today. Search and booking
              arrive in Phase 4 — see what works below.
            </p>
          </Reveal>

          {/*
           * Decorative. The chips name capabilities the platform genuinely
           * enforces in code — they are not statistics, and deliberately not a
           * star rating: an invented rating on a health product is a claim a
           * patient would act on.
           */}
          <Reveal className="tl-hero__visual" variant="scale" delay={120}>
            <div className="tl-hero__glow" aria-hidden="true" />
            <svg className="tl-hero__rings" viewBox="0 0 400 400" aria-hidden="true">
              <circle
                cx="200"
                cy="200"
                r="150"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="3 10"
              />
              <circle
                cx="200"
                cy="200"
                r="185"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="2 16"
              />
            </svg>

            <HeroTooth className="tl-hero__tooth" />

            <p className="tl-hero__chip tl-hero__chip--one">
              <Icon name="shieldCheck" />
              Verified qualifications
            </p>
            <p className="tl-hero__chip tl-hero__chip--two">
              <Icon name="scale" />
              Promoted results labelled
            </p>
            <p className="tl-hero__chip tl-hero__chip--three">
              <Icon name="lock" />
              Records owned by patients
            </p>
          </Reveal>
        </div>
      </section>

      {/* ================= SPECIALTIES ================= */}
      <section className="tl-section" aria-labelledby="specialties-heading">
        <div className="tl-container">
          <Reveal>
            <SectionHeading
              id="specialties-heading"
              eyebrow="Dental care"
              title="Every specialty a dentist can be verified in"
              lead={
                <>
                  These are the {DENTAL_SPECIALTIES.length} specialties Toothlogy recognises
                  today. A dentist selects theirs on their profile, and each one becomes a
                  discovery filter when search ships in Phase 4.
                </>
              }
            />
          </Reveal>

          {/*
           * A list, not a grid of divs: it is a list of specialties, and a
           * screen reader announcing "list, 12 items" is genuinely useful here.
           * These are not links — there is nowhere yet for them to lead.
           */}
          <ul className="tl-tiles">
            {DENTAL_SPECIALTIES.map((specialty, index) => (
              <Reveal
                as="li"
                key={specialty.key}
                // Staggered in rows rather than strictly per item, so the last
                // card of twelve is not still animating a second later.
                delay={(index % 4) * 70}
              >
                <Tile
                  icon={SPECIALTY_ICONS[specialty.key] ?? 'tooth'}
                  title={specialty.name}
                  text={specialty.description}
                />
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ================= WHY TOOTHLOGY ================= */}
      <section className="tl-section tl-section--soft" aria-labelledby="why-heading">
        <div className="tl-container tl-split">
          <Reveal className="tl-split__copy">
            <SectionHeading
              id="why-heading"
              eyebrow="Why Toothlogy"
              title={
                <>
                  Trust you can <span className="tl-gradient-text">check</span>, not just claim
                </>
              }
              lead="Four commitments written into the platform's constitution and enforced by its architecture, rather than promised in a footer."
            />
            <Link className="tl-button tl-button--primary tl-button--md" href="/about">
              How Toothlogy is built
            </Link>
          </Reveal>

          <ul className="tl-split__list">
            {WHY_TOOTHLOGY.map((item, index) => (
              <Reveal as="li" key={item.title} delay={index * 90}>
                <Feature icon={item.icon} title={item.title} text={item.text} />
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ================= WHAT WORKS TODAY ================= */}
      <section className="tl-section" aria-labelledby="status-heading">
        <div className="tl-container">
          <Reveal>
            <SectionHeading
              id="status-heading"
              eyebrow="Honest status"
              title="What works today"
              lead="Toothlogy is being built in dependency order, and this section says where it has actually got to. Nothing below is a mock-up."
            />
          </Reveal>

          <div className="tl-tiles tl-tiles--wide">
            <Reveal>
              <article className="tl-tile">
                <div className="tl-card__title-row">
                  <h3 className="tl-tile__title">Available now</h3>
                  <Badge tone="success">Working</Badge>
                </div>
                <ul className="tl-list" style={{ marginBlockStart: 'var(--tl-space-3)' }}>
                  <li>
                    <strong>Accounts</strong>
                    <span className="tl-list__meta">
                      Registration, sign-in, sessions, password reset, account deletion
                    </span>
                  </li>
                  <li>
                    <strong>Organizations</strong>
                    <span className="tl-list__meta">
                      Clinics and suppliers, members, invitations, branches, opening hours
                    </span>
                  </li>
                  <li>
                    <strong>Dentist profiles</strong>
                    <span className="tl-list__meta">
                      Qualifications, specialties, practices, and credential verification
                    </span>
                  </li>
                  <li>
                    <strong>Security</strong>
                    <span className="tl-list__meta">
                      Device management, audit trail, role-based access control
                    </span>
                  </li>
                </ul>
              </article>
            </Reveal>

            <Reveal delay={80}>
              <article className="tl-tile">
                <div className="tl-card__title-row">
                  <h3 className="tl-tile__title">Not built yet</h3>
                  <Badge tone="warning">Later phases</Badge>
                </div>
                <p className="tl-tile__text" style={{ marginBlockStart: 'var(--tl-space-3)' }}>
                  Dentist discovery, appointment booking, dental records, messaging, reviews and
                  the marketplace are designed and registered but not implemented. They are
                  listed here rather than advertised as working.
                </p>
                <p className="tl-tile__text">
                  Each of those routes exists and says which phase delivers it, instead of
                  showing a search box that returns nothing.
                </p>
              </article>
            </Reveal>

            <Reveal delay={160}>
              <article className="tl-tile">
                <h3 className="tl-tile__title">Architecture</h3>
                <p className="tl-tile__text">
                  Counted from the registry as this page renders, so the figures cannot drift
                  from what the repository contains.
                </p>
                {/*
                 * Every value below is read from the registry. The counter
                 * animates the number it was given and can never invent one —
                 * with JavaScript off, the same figure is already in the HTML.
                 */}
                <dl className="tl-stats" style={{ marginBlockStart: 'var(--tl-space-4)' }}>
                  <div>
                    <dt className="tl-stat-card__label">Modules</dt>
                    <dd className="tl-stat-card__value" style={{ margin: 0 }}>
                      <Counter value={summary.modules.total} />
                    </dd>
                    <dd className="tl-stat-card__meta" style={{ margin: 0 }}>
                      {summary.modules.implemented} built
                    </dd>
                  </div>
                  <div>
                    <dt className="tl-stat-card__label">APIs</dt>
                    <dd className="tl-stat-card__value" style={{ margin: 0 }}>
                      <Counter value={summary.apis.total} />
                    </dd>
                    <dd className="tl-stat-card__meta" style={{ margin: 0 }}>
                      {summary.apis.implemented} live
                    </dd>
                  </div>
                  <div>
                    <dt className="tl-stat-card__label">Entities</dt>
                    <dd className="tl-stat-card__value" style={{ margin: 0 }}>
                      <Counter value={summary.entities.total} />
                    </dd>
                  </div>
                  <div>
                    <dt className="tl-stat-card__label">Divisions</dt>
                    <dd className="tl-stat-card__value" style={{ margin: 0 }}>
                      <Counter value={summary.divisions.total} />
                    </dd>
                  </div>
                </dl>
              </article>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= PILLARS + REACH ================= */}
      <section className="tl-section tl-section--sunken" aria-labelledby="pillars-heading">
        <div className="tl-container">
          <Reveal>
            <SectionHeading
              id="pillars-heading"
              align="center"
              eyebrow="The five pillars"
              title="Every feature maps to one of these"
              lead="A feature that maps to none does not belong in Toothlogy — and the architecture enforces that rather than trusting discipline."
            />
          </Reveal>

          <Reveal delay={80} className="tl-pillars">
            {PILLARS.map((pillar) => (
              <Badge key={pillar} tone="brand">
                {pillar}
              </Badge>
            ))}
          </Reveal>

          <ul className="tl-stats" style={{ marginBlockStart: 'var(--tl-space-7)' }}>
            <Reveal as="li" className="tl-stat-card">
              <span className="tl-stat-card__value">
                <Counter value={summary.entities.total} />
              </span>
              <span className="tl-stat-card__label">Data entities modelled</span>
              <span className="tl-stat-card__meta">Across {summary.divisions.total} divisions</span>
            </Reveal>
            <Reveal as="li" className="tl-stat-card" delay={80}>
              <span className="tl-stat-card__value">
                <Counter value={DENTAL_SPECIALTIES.length} />
              </span>
              <span className="tl-stat-card__label">Dental specialties recognised</span>
              <span className="tl-stat-card__meta">Verifiable on a dentist profile</span>
            </Reveal>
            <Reveal as="li" className="tl-stat-card" delay={160}>
              <span className="tl-stat-card__value">
                <Counter value={enabledLanguages} />
              </span>
              <span className="tl-stat-card__label">Languages enabled</span>
              <span className="tl-stat-card__meta">{LANGUAGES.length} defined in the registry</span>
            </Reveal>
            <Reveal as="li" className="tl-stat-card" delay={240}>
              <span className="tl-stat-card__value">
                <Counter value={COUNTRIES.length} />
              </span>
              <span className="tl-stat-card__label">Countries configured</span>
              <span className="tl-stat-card__meta">Currency, tax and locale per country</span>
            </Reveal>
          </ul>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="tl-section tl-section--tight" aria-labelledby="cta-heading">
        <div className="tl-container">
          <Reveal className="tl-cta" variant="scale">
            <LogoMark className="tl-cta__watermark" />
            <h2 className="tl-cta__title" id="cta-heading">
              Your healthier smile starts here
            </h2>
            <p className="tl-cta__lead">
              Create an account to be ready when discovery opens — or list your practice now and
              get your qualifications verified before patients start searching.
            </p>
            <div className="tl-cta__actions">
              <Link className="tl-button tl-button--on-brand tl-button--lg" href="/register">
                Create an account
              </Link>
              <Link
                className="tl-button tl-button--on-brand-ghost tl-button--lg"
                href="/for-dentists"
              >
                For dentists
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
