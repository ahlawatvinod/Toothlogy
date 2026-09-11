'use client';

/**
 * Account centre navigation.
 *
 * One list for every account page, so the account area reads as one place
 * rather than a set of pages that happen to share a URL prefix. Role-specific
 * entries (dentist profile, verification queue, organizations) are passed in
 * by the server layout, which knows the principal's permissions — this client
 * component never decides what a user may see.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface AccountNavItem {
  readonly href: string;
  readonly label: string;
  readonly badge?: string;
}

export function AccountNav({ items }: { items: readonly AccountNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="tl-account-nav" aria-label="Account">
      <ul>
        {items.map((item) => {
          const active =
            item.href === '/account' ? pathname === '/account' : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? 'page' : undefined}>
                <span>{item.label}</span>
                {item.badge ? (
                  <span className="tl-badge tl-badge--brand" aria-label={`${item.badge} unread`}>
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
