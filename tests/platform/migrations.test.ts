/**
 * Migration and raw-SQL guards for the MySQL database.
 *
 * Static, so they run on every `npm test` with no database — which matters,
 * because the failures they catch are silent at runtime:
 *
 * - `prisma migrate dev` emits `COLLATE utf8mb4_unicode_ci` on every table it
 *   creates. That collation is case- and accent-insensitive, and nothing breaks
 *   visibly when a new table gets it — two token hashes differing only in case
 *   just start comparing equal. So every CREATE TABLE is checked.
 * - PostgreSQL syntax in a migration or a raw query fails only when that
 *   statement runs, which for a rarely-hit path may be in production.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'prisma', 'migrations');

function migrationFiles(): Array<{ name: string; sql: string }> {
  return readdirSync(MIGRATIONS)
    .filter((entry) => statSync(join(MIGRATIONS, entry)).isDirectory())
    .sort()
    .map((entry) => ({
      name: entry,
      sql: readFileSync(join(MIGRATIONS, entry, 'migration.sql'), 'utf8'),
    }));
}

/** Strip `--` comments so prose about PostgreSQL does not trip the scans. */
function withoutComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|mts)$/.test(entry)) out.push(path);
  }
  return out;
}

/** Constructs PostgreSQL accepts and MySQL rejects or silently misreads. */
const POSTGRES_ONLY: ReadonlyArray<[string, RegExp]> = [
  ['double-quoted identifier (a string literal on MySQL)', /"[A-Za-z_][A-Za-z0-9_]*"\s*[.(,=)]/],
  ['type cast ::', /[A-Za-z0-9_)'"]::[a-z]/],
  ['ON CONFLICT', /\bON\s+CONFLICT\b/i],
  ['RETURNING', /\bRETURNING\b/i],
  ['ILIKE', /\bILIKE\b/i],
  ['tsvector / tsquery', /\bts(vector|query)\b|to_tsvector|plainto_tsquery/i],
  ['CREATE EXTENSION', /\bCREATE\s+EXTENSION\b/i],
  ['plpgsql', /\bplpgsql\b/i],
  ['JSONB', /\bJSONB\b/i],
  ['array column', /\b(TEXT|INTEGER|VARCHAR)\[\]/i],
  ['SERIAL', /\b(BIG)?SERIAL\b/i],
];

describe('migrations target MySQL', () => {
  it('declares MySQL in the schema and in the migration lock', () => {
    const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
    expect(schema).toMatch(/datasource db \{\s*provider = "mysql"/);
    const lock = readFileSync(join(MIGRATIONS, 'migration_lock.toml'), 'utf8');
    expect(lock).toMatch(/provider = "mysql"/);
  });

  it('has at least one migration', () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
  });

  it('creates every table with the binary collation', () => {
    const offenders: string[] = [];
    for (const { name, sql } of migrationFiles()) {
      const tables = withoutComments(sql).matchAll(/CREATE TABLE `(\w+)`[\s\S]*?\)\s*([^;]*);/g);
      for (const [, table, options] of tables) {
        if (!/COLLATE\s+utf8mb4_bin\b/.test(options ?? '')) offenders.push(`${name}: ${table}`);
      }
    }
    // A new table from `prisma migrate dev` fails here until its
    // `COLLATE utf8mb4_unicode_ci` is changed to `utf8mb4_bin` — see the
    // MYSQL CONVENTIONS note at the top of prisma/schema.prisma.
    expect(offenders).toEqual([]);
  });

  it('uses a case-insensitive column collation only for full-text search', () => {
    // Allowed exceptions, as table.column. Anything else must be binary.
    const allowed = new Set(['search_documents.title', 'search_documents.summary', 'search_documents.body']);
    const found: string[] = [];
    for (const { sql } of migrationFiles()) {
      const clean = withoutComments(sql);
      // Scan table by table, so a column is attributed to the table it is in.
      for (const [, table, body] of clean.matchAll(/CREATE TABLE `(\w+)` \(([\s\S]*?)\)\s*DEFAULT CHARACTER SET/g)) {
        for (const [, column, collation] of (body ?? '').matchAll(/`(\w+)` [A-Z]+[^,\n]*?COLLATE (\w+)/g)) {
          if (collation !== 'utf8mb4_bin') found.push(`${table}.${column}`);
        }
      }
    }
    expect(found.filter((c) => !allowed.has(c))).toEqual([]);
    // And the exceptions are really there: without them, full-text search
    // becomes case-sensitive — "implant" stops finding "Implant".
    expect(found.sort()).toEqual([...allowed].sort());
  });

  it.each(POSTGRES_ONLY)('contains no PostgreSQL-only syntax: %s', (_label, pattern) => {
    const offenders = migrationFiles()
      .filter(({ sql }) => pattern.test(withoutComments(sql)))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});

describe('raw SQL in the application is MySQL', () => {
  // Every tagged `$queryRaw` / `$executeRaw` template body in the source.
  const rawStatements = [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'tests', 'helpers'))]
    .flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      // The type argument can nest — `$queryRaw<Array<{ … }>>` — so it allows
      // one level of inner <…>. A flat `<[^>]*>` stopped at the first `>`,
      // never matched such a call, and left it silently unchecked.
      return [...text.matchAll(/\$(?:queryRaw|executeRaw)(?:Unsafe)?(?:<(?:[^<>]|<[^<>]*>)*>)?\s*(?:`([\s\S]*?)`|\(\s*`([\s\S]*?)`)/g)].map(
        (match) => ({ file: file.slice(ROOT.length + 1), sql: match[1] ?? match[2] ?? '' }),
      );
    });

  it('finds the raw statements it is meant to check', () => {
    // Guards the guard: if the pattern above stops matching, every check
    // below passes vacuously. Named statements rather than a count, because a
    // count stays satisfied while one specific statement slips out of scope.
    const inStores = rawStatements.filter((s) => s.file.endsWith('db/stores.ts'));
    expect(inStores.some((s) => /INSERT INTO/.test(s.sql))).toBe(true);
    expect(inStores.some((s) => /SELECT/.test(s.sql))).toBe(true);
    expect(rawStatements.some((s) => /SELECT 1/.test(s.sql))).toBe(true);
  });

  it.each(POSTGRES_ONLY)('contains no PostgreSQL-only syntax: %s', (_label, pattern) => {
    const offenders = rawStatements
      .filter(({ sql }) => pattern.test(sql.replace(/\$\{[^}]*\}/g, '?')))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
