/**
 * TL-TEST-SECRETS-001 — Secret scanning and security invariants
 *
 * Constitution §9: no secret, credential, key or token in source control —
 * ever, including tests and fixtures.
 *
 * A one-time review cannot enforce that; a committed secret is usually added
 * long after the review, in a hurry, by someone debugging. This suite is a
 * standing guard that runs on every change.
 *
 * It also asserts a handful of structural security invariants that would
 * otherwise only be caught by a careful reviewer noticing a diff — for example
 * an API endpoint that requires a permission but not authentication.
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { APIS } from '@/registry/apis';
import { CONFIG_ENTRIES } from '@/registry/flags';
import { ENTITIES } from '@/registry/entities';
import { PAGES } from '@/registry/surfaces';

/**
 * Source files to scan.
 *
 * Enumerated with git so build output and dependencies are excluded — the
 * question is what would reach source control, not what exists on disk.
 *
 * `--cached --others --exclude-standard` covers files already in the index AND
 * files not yet added but not gitignored. Scanning only the index would miss a
 * secret in a brand-new file — which is precisely the file most likely to
 * contain one, and precisely when catching it still costs nothing.
 */
function trackedSourceFiles(): string[] {
  try {
    return execSync('git ls-files --cached --others --exclude-standard', {
      encoding: 'utf8',
      cwd: process.cwd(),
      maxBuffer: 20 * 1024 * 1024,
    })
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
      .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|json|css|prisma|ya?ml|env.*)$/.test(f))
      .filter((f) => !f.startsWith('node_modules/'))
      .filter((f) => f !== 'package-lock.json');
  } catch {
    return [];
  }
}

/**
 * Patterns for credentials that are genuinely secret.
 *
 * Deliberately narrow. A scanner that fires on the word "password" flags every
 * legitimate mention — including this comment — and a scanner that everyone
 * ignores protects nothing.
 */
const SECRET_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'private key block', pattern: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Stripe live secret key', pattern: /\bsk_live_[0-9a-zA-Z]{16,}/ },
  { name: 'Razorpay live key', pattern: /\brzp_live_[0-9a-zA-Z]{10,}/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token', pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[0-9A-Za-z]{36,}/ },
  { name: 'JWT with payload', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./ },
  {
    name: 'database URL with credentials',
    pattern: /(postgres|postgresql|mysql|mongodb):\/\/[^\s:'"]+:[^\s@'"]{6,}@/,
  },
];

describe('no committed secrets', () => {
  const files = trackedSourceFiles();

  it('finds tracked files to scan', () => {
    // If this fails the scan is vacuous, and a vacuous security test is worse
    // than none — it reports green while checking nothing.
    expect(files.length).toBeGreaterThan(10);
  });

  it('contains no credential patterns in tracked source', () => {
    const findings: string[] = [];

    for (const file of files) {
      let content: string;
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      for (const { name, pattern } of SECRET_PATTERNS) {
        // The scanner's own pattern definitions would otherwise match.
        if (file === 'tests/security/secrets.test.ts') continue;

        const match = pattern.exec(content);
        if (match) {
          const line = content.slice(0, match.index).split('\n').length;
          findings.push(`${file}:${line} — possible ${name}`);
        }
      }
    }

    expect(findings, `Possible committed secrets:\n${findings.join('\n')}`).toEqual([]);
  });

  it('has no .env file tracked in git', () => {
    // .env.example is expected and safe; .env holds real values.
    const tracked = files.filter((f) => /(^|\/)\.env$/.test(f) || /\.env\.(local|production)$/.test(f));
    expect(tracked).toEqual([]);
  });
});

describe('configuration safety', () => {
  it('never marks a secret as public', () => {
    // A public-scope secret would be inlined into the browser bundle.
    const leaky = CONFIG_ENTRIES.filter((c) => c.scope === 'public' && c.secret);
    expect(leaky.map((c) => c.key)).toEqual([]);
  });

  it('prefixes every public config key with NEXT_PUBLIC_', () => {
    // The check that stops an API secret from reaching client JavaScript
    // through a careless rename.
    const misprefixed = CONFIG_ENTRIES.filter(
      (c) => c.scope === 'public' && !c.key.startsWith('NEXT_PUBLIC_'),
    );
    expect(misprefixed.map((c) => c.key)).toEqual([]);
  });

  it('declares no default value for a secret', () => {
    // A default secret is a shared secret, and a shared secret is not a secret.
    const withDefaults = CONFIG_ENTRIES.filter((c) => c.secret && c.defaultValue !== null);
    expect(withDefaults.map((c) => c.key)).toEqual([]);
  });
});

describe('API security invariants', () => {
  it('never requires a permission without requiring authentication', () => {
    // Such an endpoint could never resolve a principal to evaluate the
    // permission against — it would always deny, or worse, be assumed safe.
    const broken = APIS.filter((a) => a.permissions.length > 0 && !a.authRequired);
    expect(broken.map((a) => a.id)).toEqual([]);
  });

  it('declares idempotency, or a stated exemption, on every mutating endpoint', () => {
    /*
     * Some mutations genuinely cannot be replayed — logging in mints a new
     * session by definition — so a blanket `idempotent: true` requirement would
     * force a false declaration. The exemption field makes "considered and
     * justified" distinguishable from "forgotten", which is the same
     * distinction `permissions: []` draws for public routes.
     */
    const mutating = APIS.filter((a) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(a.method));
    const unaccounted = mutating.filter((a) => !a.idempotent && !a.idempotencyExemption);
    expect(unaccounted.map((a) => a.id)).toEqual([]);

    // An exemption must actually explain itself, not be an empty string.
    const emptyExemptions = mutating.filter(
      (a) => a.idempotencyExemption !== undefined && a.idempotencyExemption.trim().length < 20,
    );
    expect(emptyExemptions.map((a) => a.id)).toEqual([]);
  });

  it('applies a rate limit to every endpoint', () => {
    const unlimited = APIS.filter((a) => !a.rateLimit);
    expect(unlimited.map((a) => a.id)).toEqual([]);
  });

  it('versions every endpoint path', () => {
    const unversioned = APIS.filter((a) => !a.path.startsWith(`/api/${a.version}/`));
    expect(unversioned.map((a) => a.id)).toEqual([]);
  });
});

describe('data protection invariants', () => {
  it('audits every PHI-classified entity', () => {
    const unaudited = ENTITIES.filter((e) => e.sensitivity === 'phi' && !e.audited);
    expect(unaudited.map((e) => e.id)).toEqual([]);
  });

  it('audits every confidential entity except the audit log itself', () => {
    // Identity, credentials and sessions are what an attacker wants; access to
    // them must leave a trail.
    //
    // AuditEvent is the one deliberate exception: an append-only log that
    // audited its own writes would emit an audit event for every audit event,
    // recursing without bound. The log *is* the trail, so it does not need a
    // second one — and it is protected instead by being immutable
    // (Constitution §8).
    const AUDIT_LOG_ITSELF = 'TL-ENT-AUDITEVENT-001';

    const unaudited = ENTITIES.filter(
      (e) => e.sensitivity === 'confidential' && !e.audited && e.id !== AUDIT_LOG_ITSELF,
    );
    expect(unaudited.map((e) => e.id)).toEqual([]);

    // The exemption is only sound while the log really is append-only.
    const auditLog = ENTITIES.find((e) => e.id === AUDIT_LOG_ITSELF);
    expect(auditLog?.softDelete, 'the audit log must never be deletable').toBe(false);
  });

  it('never marks a permission-gated page as indexable', () => {
    // An indexed private page is how clinical surfaces end up in a search
    // engine's cache.
    const indexed = PAGES.filter((p) => p.indexable && p.permissions.length > 0);
    expect(indexed.map((p) => p.id)).toEqual([]);
  });

  it('never marks a non-anonymous page as indexable', () => {
    const indexed = PAGES.filter((p) => p.indexable && p.audience !== 'anonymous');
    expect(indexed.map((p) => p.id)).toEqual([]);
  });
});
