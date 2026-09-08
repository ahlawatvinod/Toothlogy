/**
 * Site footer.
 *
 * Carries the legal and trust links a health platform is expected to surface on
 * every page. Grouped under headed lists rather than a flat row of links, so
 * screen-reader users get structure instead of thirty consecutive anchors.
 */

import Link from 'next/link';

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
    heading: 'Toothlogy',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
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

export function SiteFooter() {
  return (
    <footer className="tl-footer">
      <div className="tl-container">
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

        <p className="tl-footer__note">
          Toothlogy helps patients find the right dentist and gives practices the tools to be
          found. Information on Toothlogy is for general guidance and is not a substitute for
          professional dental advice, diagnosis or treatment.
        </p>
      </div>
    </footer>
  );
}
