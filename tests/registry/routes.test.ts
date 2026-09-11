/**
 * TL-TEST-ROUTES-001 — Every API route is registered, and registered truthfully
 *
 * The API registry is only worth anything if it describes the routes that
 * actually exist. This scans every `route.ts` under `src/app/api`, reads each
 * `defineRoute({ id: … })` and the HTTP method it is exported as, and checks:
 *
 * - the id exists in the registry (no unregistered endpoints);
 * - the registered method and path match the file (no drift);
 * - the registered permissions match the code's `permissions: [...]`;
 * - every registered, implemented endpoint has a route file (no fiction).
 *
 * A route that is not in the registry is a route nobody reviewed.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APIS } from '@/registry/apis';

const API_ROOT = join(process.cwd(), 'src', 'app', 'api');

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

/** `src/app/api/v1/organizations/[id]/route.ts` → `/api/v1/organizations/:id` */
function pathFor(file: string): string {
  const rel = relative(join(process.cwd(), 'src', 'app'), file).split(sep).slice(0, -1);
  return `/${rel.map((segment) => segment.replace(/^\[(\w+)\]$/, ':$1')).join('/')}`;
}

interface Declared {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly permissions: string[];
  readonly file: string;
}

function declaredRoutes(): Declared[] {
  const out: Declared[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const source = readFileSync(file, 'utf8');
    const pattern =
      /export const (GET|POST|PUT|PATCH|DELETE) = defineRoute\(\{\s*id: '([A-Z0-9-]+)',\s*permissions: \[([^\]]*)\]/g;
    for (const match of source.matchAll(pattern)) {
      out.push({
        method: match[1]!,
        id: match[2]!,
        permissions: [...match[3]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!),
        path: pathFor(file),
        file: relative(process.cwd(), file),
      });
    }
  }
  return out;
}

describe('API routes and the API registry', () => {
  const declared = declaredRoutes();
  const byId = new Map(APIS.map((a) => [a.id, a]));

  it('finds route handlers to check', () => {
    expect(declared.length).toBeGreaterThan(30);
  });

  it('registers every route handler', () => {
    const unregistered = declared.filter((d) => !byId.has(d.id));
    expect(unregistered.map((d) => `${d.id} (${d.method} ${d.path})`)).toEqual([]);
  });

  it('registers the method and path each handler actually serves', () => {
    const drift = declared
      .map((d) => ({ d, a: byId.get(d.id) }))
      .filter(({ d, a }) => a && (a.method !== d.method || a.path !== d.path))
      .map(({ d, a }) => `${d.id}: code ${d.method} ${d.path}, registry ${a!.method} ${a!.path}`);
    expect(drift).toEqual([]);
  });

  it('registers the permissions each handler actually checks', () => {
    const drift = declared
      .map((d) => ({ d, a: byId.get(d.id) }))
      .filter(({ d, a }) => a && [...a.permissions].sort().join(',') !== [...d.permissions].sort().join(','))
      .map(({ d, a }) => `${d.id}: code [${d.permissions}] registry [${a!.permissions}]`);
    expect(drift).toEqual([]);
  });

  it('has a handler for every endpoint registered as implemented', () => {
    const served = new Set(declared.map((d) => d.id));
    const fiction = APIS.filter((a) => a.status === 'implemented' && !served.has(a.id)).map((a) => a.id);
    expect(fiction).toEqual([]);
  });
});
