/**
 * TL-TEST-PAGES-001 — Every page is registered, and every registered page exists
 *
 * The page registry drives robots/sitemap decisions and certification. It is
 * only trustworthy if it matches the `page.tsx` files that actually exist, in
 * both directions.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGES } from '@/registry/surfaces';

const APP = join(process.cwd(), 'src', 'app');

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'api') continue;
      out.push(...pageFiles(full));
    } else if (name === 'page.tsx') out.push(full);
  }
  return out;
}

/** `(app)/account/organizations/[id]/page.tsx` → `/account/organizations/:id` */
function routeFor(file: string): string {
  const segments = relative(APP, file)
    .split(sep)
    .slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s))
    .map((s) => s.replace(/^\[(\w+)\]$/, ':$1'));
  return `/${segments.join('/')}`;
}

describe('pages and the page registry', () => {
  const routes = pageFiles(APP).map(routeFor);
  const registered = new Map(PAGES.map((p) => [p.route, p]));

  it('registers every page route', () => {
    expect(routes.filter((r) => !registered.has(r))).toEqual([]);
  });

  it('has a page file for every registered route', () => {
    const existing = new Set(routes);
    expect(PAGES.filter((p) => !existing.has(p.route)).map((p) => p.route)).toEqual([]);
  });

  it('never marks an authenticated or staff page indexable', () => {
    expect(PAGES.filter((p) => p.indexable && p.audience !== 'anonymous').map((p) => p.id)).toEqual([]);
  });
});
