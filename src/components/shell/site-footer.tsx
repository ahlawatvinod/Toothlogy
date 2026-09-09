/**
 * Site footer.
 *
 * Carries the legal and trust links a health platform is expected to surface on
 * every page. Grouped under headed lists rather than a flat row of links, so
 * screen-reader users get structure instead of thirty consecutive anchors.
 *
 * SOCIAL LINKS
 * There are none, and the row is absent rather than rendered with `href="#"`.
 * A social icon that goes nowhere is indistinguishable from a broken one, and
 * an icon pointing at an account Toothlogy does not control is worse — it is an
 * invitation to whoever registers that handle first. When the accounts exist,
 * add them to `SOCIAL` and the row appears.
 */

import Link from 'next/link';
import { Logo } from '@/components/brand/logo';

const SECTIONS: ReadonlyArray<{
  heading: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}> = [
  {
    heading: 'Patients',
    links: [
      { href: '/find', label: 'Find a dentist' },
      { href: '/knowledge', label: 'Dental knowledge' },
      { href: '/help', label: 'Help centre' },
    ],
  },
  {
    heading: 'Professionals',
    links: [
      { href: '/for-dentists', label: 'For dentists' },
      { href: '/for-clinics', label: 'For clinics' },
      { href: '/register?role=dentist', label: 'List your practice' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { href: '/login', label: 'Sign in' },
      { href: '/register', label: 'Create an account' },
      { href: '/account', label: 'Your account' },
    ],
  },
  {
    heading: 'Toothlogy',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      // No link to /design-system: it is behind the `design_system_reference`
      // flag, which is off in production, so the link would be a 404 for every
      // visitor who is not a developer running it locally.
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
];

/** Add entries here when the accounts exist. See the note at the top. */
const SOCIAL: ReadonlyArray<{ href: string; label: string; path: string }> = [];

export function SiteFooter() {
  const year = new Date().getUTCFullYear();

  return (
    <footer className="tl-footer">
      <div className="tl-container">
        <div className="tl-footer__top">
          <div className="tl-footer__brand">
            <Link href="/" className="tl-footer__brand-link" aria-label="Toothlogy home">
              <Logo />
            </Link>
            <p className="tl-footer__tagline">
              A global dental ecosystem connecting patients, dentists, clinics, colleges,
              students and suppliers — built so competence is discoverable, not just marketing
              budgets.
            </p>

            {SOCIAL.length > 0 ? (
              <ul className="tl-footer__social">
                {SOCIAL.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} aria-label={item.label} rel="me noreferrer">
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d={item.path} />
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="tl-footer__grid">
            {SECTIONS.map((section) => (
              <nav key={section.heading} aria-label={section.heading}>
                <h2 className="tl-footer__heading">{section.heading}</h2>
                <ul className="tl-footer__list">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="tl-footer__bottom">
          <p className="tl-footer__note">
            Toothlogy helps patients find the right dentist and gives practices the tools to be
            found. Information on Toothlogy is for general guidance and is not a substitute for
            professional dental advice, diagnosis or treatment.
          </p>
          {/* UTC, matching how every timestamp in the platform is stored. A
              copyright year that flips a day early in one timezone is a small
              thing, but it is the same class of bug as a booking that does. */}
          <p className="tl-footer__legal">© {year} Toothlogy</p>
        </div>
      </div>
    </footer>
  );
}
