/**
 * TOOTHLOGY STRUCTURED LOGGING
 *
 * Constitution §9: logs never contain secrets, tokens, passwords or unnecessary
 * PHI/PII. Founding spec §22: no noisy or meaningless logging.
 *
 * Redaction is applied by the logger itself, on every field, every time. It is
 * deliberately not the caller's responsibility. A rule that says "remember not
 * to log the password" is a rule that will be broken in the third year of a
 * project by someone logging a whole request body during an incident — which is
 * exactly when logs are most widely read. Redacting centrally means that mistake
 * produces `[REDACTED]` instead of a breach.
 *
 * Output is one JSON object per line: parseable by any log aggregator, and
 * readable enough with `jq` when there is no aggregator yet.
 */

import { SECRET_CONFIG_KEYS } from '@/registry/flags';
import { getEnvironment } from '../config';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const REDACTED = '[REDACTED]';

/**
 * Field names that are redacted wherever they appear, at any depth.
 *
 * Matching is case-insensitive and substring-based, so `password`,
 * `newPassword`, `password_confirmation` and `PASSWORD` are all covered by one
 * entry. Over-redaction is the correct failure direction here: a missing log
 * field costs debugging time, a leaked credential costs a security incident.
 */
const SENSITIVE_FIELD_PATTERNS: readonly string[] = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'auth',
  'cookie',
  'session',
  'apikey',
  'api_key',
  'accesskey',
  'privatekey',
  'credential',
  'otp',
  'pin',
  'cvv',
  'cardnumber',
  'card_number',
  'aadhaar',
  'pan',
  'ssn',
  // PHI: clinical content must never reach a log line (Constitution §9).
  'diagnosis',
  'prescription',
  'medicalhistory',
  'medical_history',
  'clinicalnote',
  'clinical_note',
];

/** Config keys marked `secret: true` in the registry are redacted by name too. */
const SECRET_KEYS_LOWER = SECRET_CONFIG_KEYS.map((k) => k.toLowerCase());

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SECRET_KEYS_LOWER.includes(lower)) return true;
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Recursively redact sensitive fields.
 *
 * `depth` caps recursion: log payloads occasionally contain cyclic or very deep
 * structures, and a logger that can hang or blow the stack is worse than no
 * logger — logging must never be able to take down the process it observes.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[MAX_DEPTH]';
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((v) => redact(v, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      // Stacks are kept outside production, where they are debugging aid, and
      // dropped in production, where they are attacker reconnaissance.
      ...(getEnvironment() === 'production' ? {} : { stack: value.stack }),
    };
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redact(val, depth + 1);
    }
    return out;
  }

  if (typeof value === 'bigint') return value.toString();
  return value;
}

export interface LogContext {
  readonly [key: string]: unknown;
}

export interface LogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly requestId?: string;
  readonly [key: string]: unknown;
}

/** Swappable sink, so tests can capture output without touching stdout. */
export type LogSink = (record: LogRecord) => void;

const defaultSink: LogSink = (record) => {
  const line = JSON.stringify(record);
  if (record.level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
};

let sink: LogSink = defaultSink;

export function setLogSink(next: LogSink): void {
  sink = next;
}

export function resetLogSink(): void {
  sink = defaultSink;
}

function currentLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL;
  return (LOG_LEVELS as readonly string[]).includes(raw ?? '') ? (raw as LogLevel) : 'info';
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Derive a logger that stamps every record with additional context. */
  child(bindings: LogContext): Logger;
}

function emit(level: LogLevel, message: string, bindings: LogContext, context?: LogContext): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[currentLevel()]) return;

  const merged = { ...bindings, ...context };
  const redacted = redact(merged) as Record<string, unknown>;

  sink({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...redacted,
  });
}

function build(bindings: LogContext): Logger {
  return {
    debug: (message, context) => emit('debug', message, bindings, context),
    info: (message, context) => emit('info', message, bindings, context),
    warn: (message, context) => emit('warn', message, bindings, context),
    error: (message, context) => emit('error', message, bindings, context),
    child: (extra) => build({ ...bindings, ...extra }),
  };
}

/** The root logger. Prefer a child logger bound to a request ID. */
export const logger: Logger = build({});

/** A logger bound to a request, so every line is correlatable (founding spec §22). */
export function requestLogger(requestId: string, extra: LogContext = {}): Logger {
  return build({ requestId, ...extra });
}
