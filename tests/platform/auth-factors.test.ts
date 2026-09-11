/**
 * TL-TEST-AUTH-FACTORS-001 — TOTP, recovery codes, secret box, login-risk helpers
 *
 * The TOTP implementation is checked against the RFC 6238 Appendix B test
 * vectors. A second factor that agrees with itself but not with Google
 * Authenticator is worse than none: it locks out every user who enrols.
 */

import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  hotp,
  normalizeRecoveryCode,
  otpauthUri,
  totp,
  totpStep,
  verifyTotp,
} from '@/platform/auth/totp';
import { open, seal, sign, verifySignature } from '@/platform/security/crypto';
import { deviceFamily, networkPrefix } from '@/platform/auth/security-events';
import { quietHoursEnd } from '@/platform/notifications';
import { InMemoryIdempotencyStore } from '@/platform/http/security';

/** RFC 6238 Appendix B: the ASCII secret "12345678901234567890". */
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it('matches the published SHA-1 test vectors (last six digits)', () => {
    const vectors: Array<[number, string]> = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ];
    for (const [seconds, expected] of vectors) {
      expect(totp(RFC_SECRET, new Date(seconds * 1000))).toBe(expected);
    }
  });

  it('matches the RFC 4226 HOTP vectors', () => {
    expect(hotp(RFC_SECRET, 0)).toBe('755224');
    expect(hotp(RFC_SECRET, 1)).toBe('287082');
    expect(hotp(RFC_SECRET, 9)).toBe('520489');
  });

  it('round-trips base32 and rejects foreign characters', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect([...base32Decode(base32Encode(bytes))]).toEqual([...bytes]);
    expect(() => base32Decode('ABC1')).toThrow();
  });

  it('generates 160-bit secrets', () => {
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
  });

  it('accepts one step of drift either side, and no more', () => {
    const now = new Date(1_700_000_000_000);
    const step = totpStep(now);
    const previous = hotp(RFC_SECRET, step - 1);
    const next = hotp(RFC_SECRET, step + 1);
    const tooOld = hotp(RFC_SECRET, step - 2);

    expect(verifyTotp(RFC_SECRET, previous, { now })).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, next, { now })).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, tooOld, { now })).toBeNull();
  });

  it('refuses a code at or before the last accepted step (replay)', () => {
    const now = new Date(1_700_000_000_000);
    const step = totpStep(now);
    const code = hotp(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, { now, lastUsedStep: null })).toBe(step);
    expect(verifyTotp(RFC_SECRET, code, { now, lastUsedStep: step })).toBeNull();
  });

  it('rejects malformed codes without comparing', () => {
    expect(verifyTotp(RFC_SECRET, '12345')).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBeNull();
  });

  it('builds an otpauth URI authenticator apps accept', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'asha@example.test');
    expect(uri.startsWith('otpauth://totp/Toothlogy%3Aasha%40example.test?')).toBe(true);
    expect(uri).toContain('issuer=Toothlogy');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});

describe('recovery codes', () => {
  it('issues ten distinct codes without look-alike characters', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
      expect(code).not.toMatch(/[01ILOU]/);
    }
  });

  it('forgives case, spaces and the dash when typed back', () => {
    expect(normalizeRecoveryCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
  });
});

describe('secret box and signatures', () => {
  it('round-trips and never contains the plaintext', () => {
    const box = seal('JBSWY3DPEHPK3PXP', 'totp-secret');
    expect(box.startsWith('v1.')).toBe(true);
    expect(box).not.toContain('JBSWY3DPEHPK3PXP');
    expect(open(box, 'totp-secret')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('detects tampering', () => {
    const box = seal('secret', 'totp-secret');
    const parts = box.split('.');
    const flipped = parts[3]!.startsWith('A') ? `B${parts[3]!.slice(1)}` : `A${parts[3]!.slice(1)}`;
    expect(() => open([parts[0], parts[1], parts[2], flipped].join('.'), 'totp-secret')).toThrow();
  });

  it('keeps purposes separate: a box for one purpose does not open as another', () => {
    const box = seal('secret', 'totp-secret');
    expect(() => open(box, 'otp-code')).toThrow();
  });

  it('verifies signatures in constant time and rejects forgeries', () => {
    const signature = sign('file:abc:123', 'signed-file-url');
    expect(verifySignature('file:abc:123', signature, 'signed-file-url')).toBe(true);
    expect(verifySignature('file:abc:124', signature, 'signed-file-url')).toBe(false);
    expect(verifySignature('file:abc:123', signature, 'unsubscribe')).toBe(false);
  });

  it('refuses to operate without a configured key rather than using a default', () => {
    const saved = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      expect(() => seal('x', 'totp-secret')).toThrow(/not configured/i);
    } finally {
      process.env.SESSION_SECRET = saved;
    }
  });
});

describe('quiet hours', () => {
  // 2026-09-10T20:30:00Z is 02:00 in Asia/Kolkata (UTC+5:30).
  const at0200Ist = new Date('2026-09-10T20:30:00Z');

  it('holds messages inside an overnight window and says until when', () => {
    const end = quietHoursEnd({ start: 22 * 60, end: 7 * 60 }, 'Asia/Kolkata', at0200Ist);
    expect(end).not.toBeNull();
    // 02:00 → 07:00 is five hours.
    expect(end!.getTime() - at0200Ist.getTime()).toBe(5 * 3600 * 1000);
  });

  it('does not hold messages outside the window', () => {
    expect(quietHoursEnd({ start: 13 * 60, end: 14 * 60 }, 'Asia/Kolkata', at0200Ist)).toBeNull();
  });

  it('evaluates on the recipient’s clock, not the server’s', () => {
    // The same instant is 22:30 in London (BST), outside a 23:00–06:00 window.
    expect(quietHoursEnd({ start: 23 * 60, end: 6 * 60 }, 'Europe/London', at0200Ist)).toBeNull();
    expect(quietHoursEnd({ start: 23 * 60, end: 6 * 60 }, 'Asia/Kolkata', at0200Ist)).not.toBeNull();
  });

  it('treats an empty window as no quiet hours', () => {
    expect(quietHoursEnd({ start: 600, end: 600 }, 'UTC', at0200Ist)).toBeNull();
    expect(quietHoursEnd(null, 'UTC', at0200Ist)).toBeNull();
  });
});

describe('login-risk helpers', () => {
  it('reduces a user agent to a stable browser/OS family', () => {
    const chromeWin =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    const chromeWinNext = chromeWin.replace('128.0.0.0', '129.0.0.0');
    const safariIphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

    expect(deviceFamily(chromeWin)).toBe('Chrome/Windows');
    // A browser update is not a new device.
    expect(deviceFamily(chromeWinNext)).toBe(deviceFamily(chromeWin));
    expect(deviceFamily(safariIphone)).toBe('Safari/iOS');
    expect(deviceFamily(null)).toBe('unknown');
  });

  it('groups addresses by network so a renumbered home router is not "new"', () => {
    expect(networkPrefix('203.0.113.5')).toBe(networkPrefix('203.0.113.200'));
    expect(networkPrefix('203.0.113.5')).not.toBe(networkPrefix('203.0.114.5'));
    expect(networkPrefix('2001:db8:abcd:1::1')).toBe(networkPrefix('2001:db8:abcd:ffff::2'));
  });
});

describe('idempotency claims', () => {
  it('claims once, reports in-progress to a concurrent retry, then replays', async () => {
    const store = new InMemoryIdempotencyStore();
    expect((await store.claim('k1', 'fp')).kind).toBe('claimed');
    expect((await store.claim('k1', 'fp')).kind).toBe('in_progress');

    await store.complete('k1', 200, { ok: true, data: { id: 'apt_1' } });
    const replay = await store.claim('k1', 'fp');
    expect(replay.kind).toBe('replay');
    if (replay.kind === 'replay') expect(replay.record.responseBody).toEqual({ ok: true, data: { id: 'apt_1' } });
  });

  it('rejects the same key with a different request', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.claim('k2', 'fp-a');
    await expect(store.claim('k2', 'fp-b')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('releases a failed claim so the client can retry', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.claim('k3', 'fp');
    await store.release('k3');
    expect((await store.claim('k3', 'fp')).kind).toBe('claimed');
  });
});
