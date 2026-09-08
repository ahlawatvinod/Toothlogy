/**
 * TL-TEST-LOGGING-001 — Log redaction
 *
 * Constitution §9: logs never contain secrets, tokens, passwords or unnecessary
 * PHI/PII.
 *
 * This suite exists because redaction is the kind of protection that is assumed
 * to work and rarely verified — right up until an incident, when logs are read
 * most widely and a leak is most damaging.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type LogRecord,
  REDACTED,
  logger,
  redact,
  requestLogger,
  setLogSink,
} from '@/platform/observability/logger';

let captured: LogRecord[] = [];

beforeEach(() => {
  captured = [];
  setLogSink((record) => captured.push(record));
});

afterEach(() => {
  setLogSink(() => {});
});

describe('field redaction', () => {
  it('redacts obvious credential fields', () => {
    const result = redact({
      email: 'user@example.com',
      password: 'hunter2',
      apiKey: 'sk_live_abc123',
      token: 'eyJhbGciOi',
    }) as Record<string, unknown>;

    expect(result.password).toBe(REDACTED);
    expect(result.apiKey).toBe(REDACTED);
    expect(result.token).toBe(REDACTED);
    // Email is not in the credential list — it is redacted where it matters
    // (analytics) rather than made unloggable everywhere.
    expect(result.email).toBe('user@example.com');
  });

  it('matches case-insensitively and as a substring', () => {
    // One entry must cover password, newPassword, PASSWORD and
    // password_confirmation — otherwise the list is unmaintainable.
    const result = redact({
      PASSWORD: 'x',
      newPassword: 'x',
      password_confirmation: 'x',
      userPassword: 'x',
    }) as Record<string, unknown>;

    for (const value of Object.values(result)) expect(value).toBe(REDACTED);
  });

  it('redacts nested fields at any depth', () => {
    // The realistic leak: someone logs a whole request object during an
    // incident, and the credential is three levels down.
    const result = redact({
      request: { headers: { authorization: 'Bearer abc' }, body: { user: { password: 'x' } } },
    }) as { request: { headers: Record<string, unknown>; body: { user: Record<string, unknown> } } };

    expect(result.request.headers.authorization).toBe(REDACTED);
    expect(result.request.body.user.password).toBe(REDACTED);
  });

  it('redacts clinical fields (PHI)', () => {
    const result = redact({
      patientId: 'usr_1',
      diagnosis: 'irreversible pulpitis',
      prescription: 'amoxicillin 500mg',
      clinicalNote: 'patient reports pain',
    }) as Record<string, unknown>;

    expect(result.diagnosis).toBe(REDACTED);
    expect(result.prescription).toBe(REDACTED);
    expect(result.clinicalNote).toBe(REDACTED);
    // An identifier is safe and necessary for correlation.
    expect(result.patientId).toBe('usr_1');
  });

  it('redacts registry-declared secret config keys', () => {
    const result = redact({ DATABASE_URL: 'postgres://u:p@h/db' }) as Record<string, unknown>;
    expect(result.DATABASE_URL).toBe(REDACTED);
  });

  it('caps recursion depth instead of hanging', () => {
    // A logger that can hang or blow the stack is worse than no logger: it can
    // take down the process it exists to observe.
    let deep: Record<string, unknown> = { value: 'bottom' };
    for (let i = 0; i < 30; i += 1) deep = { nested: deep };

    expect(() => redact(deep)).not.toThrow();
    expect(JSON.stringify(redact(deep))).toContain('MAX_DEPTH');
  });

  it('handles arrays, errors, bigints and nullish values', () => {
    expect(redact([{ password: 'x' }])).toEqual([{ password: REDACTED }]);
    expect(redact(12345n)).toBe('12345');
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();

    const err = redact(new Error('boom')) as { name: string; message: string };
    expect(err.message).toBe('boom');
  });
});

describe('logger output', () => {
  it('emits a structured record with level, message and timestamp', () => {
    logger.info('Something happened', { userId: 'usr_1' });

    expect(captured).toHaveLength(1);
    const record = captured[0]!;
    expect(record.level).toBe('info');
    expect(record.message).toBe('Something happened');
    expect(record.userId).toBe('usr_1');
    expect(() => new Date(record.timestamp).toISOString()).not.toThrow();
  });

  it('redacts context passed to the logger', () => {
    logger.error('Login failed', { password: 'hunter2', attempt: 3 });
    expect(captured[0]!.password).toBe(REDACTED);
    expect(captured[0]!.attempt).toBe(3);
  });

  it('stamps every line from a request logger with its request ID', () => {
    // The property that makes "it broke at 3pm" traceable to an exact request.
    const log = requestLogger('req_123', { route: 'TL-API-HEALTH-001' });
    log.info('start');
    log.info('finish');

    expect(captured.every((r) => r.requestId === 'req_123')).toBe(true);
    expect(captured.every((r) => r.route === 'TL-API-HEALTH-001')).toBe(true);
  });

  it('merges child bindings without mutating the parent', () => {
    const parent = requestLogger('req_a');
    parent.child({ scope: 'child' }).info('from child');
    parent.info('from parent');

    expect(captured[0]!.scope).toBe('child');
    expect(captured[1]!.scope).toBeUndefined();
  });

  it('respects the configured minimum level', () => {
    const previous = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'warn';
    try {
      logger.debug('noise');
      logger.info('also noise');
      logger.warn('kept');
      logger.error('kept');
      expect(captured.map((r) => r.level)).toEqual(['warn', 'error']);
    } finally {
      process.env.LOG_LEVEL = previous;
    }
  });
});
