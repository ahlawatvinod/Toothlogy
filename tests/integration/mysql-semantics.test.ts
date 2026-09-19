/**
 * MySQL SEMANTICS (integration)
 *
 * The PostgreSQL → MySQL migration changed engine behaviours that no existing
 * test would notice going wrong, because each one fails silently rather than
 * loudly. This suite pins every one of them against a real server.
 *
 * - Collation: MySQL's default is case- and accent-insensitive. The schema
 *   uses utf8mb4_bin so comparisons stay byte-exact, as they were.
 * - Column length: a plain `String` is VARCHAR(191) on MySQL. Free text and
 *   email are sized so nothing the app accepts is rejected by the column.
 * - Arrays: MySQL has none; the two list columns are JSON.
 * - Full text: FULLTEXT under a binary collation is case-sensitive, so the
 *   searchable columns carry a case-insensitive collation of their own.
 * - Constraint errors: Prisma reports an index NAME on MySQL, not fields.
 * - Rate limiting: no `RETURNING` on MySQL, so atomicity comes from a
 *   transaction — proven here under concurrency, which is the only condition
 *   under which a rate limit matters.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createSession, resolveSession } from '@/platform/auth/session';
import { isAuthenticated } from '@/platform/rbac';
import { DatabaseRateLimitStore } from '@/platform/db/stores';
import { jsonStringArray } from '@/platform/db/json';
import { isUniqueConstraintError, uniqueConstraintFields } from '@/platform/db/client';
import {
  assertSeeded,
  describeIntegration,
  disconnectTestDb,
  resetDatabase,
  testDb,
} from '../helpers/database';

async function makeUser(email: string) {
  const { userId } = await register({
    email,
    password: 'a sufficiently long passphrase',
    displayName: 'Semantics Probe',
    role: 'patient',
    acceptedTerms: true,
  });
  return userId;
}

/** A base64url-looking hash with its letter case flipped. */
function flipCase(value: string): string {
  return [...value].map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join('');
}

describeIntegration('MySQL semantics (integration)', () => {
  beforeAll(async () => {
    await assertSeeded();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  // -------------------------------------------------------------------------
  // Collation
  // -------------------------------------------------------------------------

  it('keeps two token hashes that differ only in letter case as separate sessions', async () => {
    const userId = await makeUser('collation@example.test');
    const hash = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdE';
    const expiresAt = new Date(Date.now() + 3600_000);

    await testDb().session.create({ data: { id: 'ses_case_a', userId, tokenHash: hash, expiresAt } });
    // Under a case-insensitive collation this insert is a unique violation.
    await testDb().session.create({
      data: { id: 'ses_case_b', userId, tokenHash: flipCase(hash), expiresAt },
    });

    const found = await testDb().session.findUnique({ where: { tokenHash: hash } });
    expect(found?.id).toBe('ses_case_a');
  });

  it('does not resolve a session from a token whose case has been altered', async () => {
    const userId = await makeUser('token@example.test');
    const { token } = await createSession(userId);

    expect(isAuthenticated(await resolveSession(token))).toBe(true);
    // base64url is case-significant: a different case is a different token.
    expect(isAuthenticated(await resolveSession(flipCase(token)))).toBe(false);
  });

  it('treats accented and unaccented values as distinct, as PostgreSQL did', async () => {
    const store = new DatabaseRateLimitStore();
    const policy = { name: 'semantics', limit: 1, windowSeconds: 60 };
    // Each key is its own window. If "José" and "Jose" collated equal, the
    // second hit would land in the first window and be refused.
    expect((await store.hit('José', policy)).allowed).toBe(true);
    expect((await store.hit('Jose', policy)).allowed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Column sizing
  // -------------------------------------------------------------------------

  it('stores free text well past the 191-character VARCHAR default, intact', async () => {
    const userId = await makeUser('long@example.test');
    const userAgent = `Mozilla/5.0 ${'(compatible; Probe) '.repeat(40)}`.trim(); // ~800 chars
    const session = await testDb().session.create({
      data: {
        id: 'ses_long_ua',
        userId,
        tokenHash: 'long-ua-hash',
        expiresAt: new Date(Date.now() + 3600_000),
        userAgent,
      },
    });
    expect(userAgent.length).toBeGreaterThan(191);
    expect(session.userAgent).toBe(userAgent);
  });

  it('accepts an email at the 320-character length validation allows', async () => {
    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.test`;
    const email = `${local}@${domain}`;
    expect(email.length).toBeGreaterThan(191);
    expect(email.length).toBeLessThanOrEqual(320);

    const userId = await makeUser(email);
    const user = await testDb().user.findUnique({ where: { id: userId } });
    expect(user?.email).toBe(email);
  });

  // -------------------------------------------------------------------------
  // JSON lists
  // -------------------------------------------------------------------------

  it('round-trips a list column in order', async () => {
    const lines = ['Flat 4B, Rose Apartments', '12 MG Road', 'Near the clock tower'];
    const address = await testDb().address.create({
      data: { id: 'addr_json_probe', lines, countryCode: 'IN' },
    });
    const read = await testDb().address.findUnique({ where: { id: address.id } });
    expect(jsonStringArray(read?.lines ?? null, 'test')).toEqual(lines);
  });

  // -------------------------------------------------------------------------
  // Full text
  // -------------------------------------------------------------------------

  it('matches full-text search regardless of letter case', async () => {
    await testDb().searchDocument.create({
      data: {
        id: 'sd_ft_probe',
        entityType: 'catalogue_service',
        entityId: 'svc_probe',
        title: 'Dental Implant',
        body: 'A titanium post that replaces the root of a missing tooth.',
        locale: 'en',
      },
    });

    // Lower-case query, title-case document: a binary collation would miss it.
    const rows = await testDb().$queryRaw<Array<{ id: string }>>`
      SELECT id FROM search_documents
      WHERE MATCH(title, summary, body) AGAINST (${'implant'} IN NATURAL LANGUAGE MODE)
    `;
    expect(rows.map((r) => r.id)).toContain('sd_ft_probe');
  });

  // -------------------------------------------------------------------------
  // Constraint errors
  // -------------------------------------------------------------------------

  it('recovers the colliding field from a MySQL unique-constraint error', async () => {
    await makeUser('dupe@example.test');
    let caught: unknown;
    try {
      await testDb().user.create({
        data: { id: 'usr_dupe_probe', email: 'dupe@example.test', status: 'ACTIVE' },
      });
    } catch (error) {
      caught = error;
    }
    expect(isUniqueConstraintError(caught)).toBe(true);
    expect(uniqueConstraintFields(caught, ['email', 'phone'])).toEqual(['email']);
  });

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  it('refuses the hit past the limit and reports when to retry', async () => {
    const store = new DatabaseRateLimitStore();
    const policy = { name: 'sequential', limit: 3, windowSeconds: 60 };

    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await store.hit('client-a', policy));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[2]?.remaining).toBe(0);
    expect(results[3]?.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('starts a fresh window once the old one has expired', async () => {
    const store = new DatabaseRateLimitStore();
    const policy = { name: 'expiry', limit: 1, windowSeconds: 60 };

    expect((await store.hit('client-b', policy)).allowed).toBe(true);
    expect((await store.hit('client-b', policy)).allowed).toBe(false);

    // Age the window into the past rather than sleeping through it.
    await testDb().rateLimitCounter.update({
      where: { key: 'expiry:client-b' },
      data: { windowEndsAt: new Date(Date.now() - 1000) },
    });

    // If the reset read the NEW window end before deciding the count, this
    // would stay refused forever — see the ordering note in stores.ts.
    const afterExpiry = await store.hit('client-b', policy);
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.remaining).toBe(0);
  });

  it('holds the limit exactly under concurrent hits on one key', async () => {
    const store = new DatabaseRateLimitStore();
    const policy = { name: 'concurrent', limit: 10, windowSeconds: 60 };

    // 40 simultaneous requests against a limit of 10. A read-then-write
    // limiter lets more than 10 through; an atomic one lets exactly 10.
    const results = await Promise.all(
      Array.from({ length: 40 }, () => store.hit('client-c', policy)),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    const counter = await testDb().rateLimitCounter.findUnique({
      where: { key: 'concurrent:client-c' },
    });
    expect(counter?.count).toBe(40);
  });
});
