/** The page Content Security Policy: nonce-bound scripts, no eval in production. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { contentSecurityPolicy, STRICT_TRANSPORT_SECURITY } from '@/platform/http/csp';
import { contentSecurityPolicy as reexported, securityHeaders } from '@/platform/http/security';
import { proxy } from '@/proxy';

const directive = (policy: string, name: string) => policy.split('; ').find((d) => d === name || d.startsWith(`${name} `));

describe('contentSecurityPolicy', () => {
  it('binds production scripts to the nonce, with strict-dynamic and no eval', () => {
    const policy = contentSecurityPolicy(true, 'bm9uY2U=');
    expect(directive(policy, 'script-src')).toBe("script-src 'self' 'nonce-bm9uY2U=' 'strict-dynamic'");
    expect(policy).not.toContain('unsafe-eval');
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(policy, 'upgrade-insecure-requests')).toBe('upgrade-insecure-requests');
    expect(directive(policy, 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
  });

  it('allows eval only in development, and never inline scripts', () => {
    const dev = contentSecurityPolicy(false, 'abc');
    expect(directive(dev, 'script-src')).toBe("script-src 'self' 'nonce-abc' 'unsafe-eval'");
    expect(directive(dev, 'upgrade-insecure-requests')).toBeUndefined();
    for (const policy of [dev, contentSecurityPolicy(true, 'abc'), contentSecurityPolicy(true)]) expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'");
  });

  it('keeps the old shape without a nonce, and is re-exported where it always was', () => {
    expect(directive(contentSecurityPolicy(true), 'script-src')).toBe("script-src 'self'");
    expect(reexported).toBe(contentSecurityPolicy);
  });
});

describe('page proxy headers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends HSTS on pages in production — the same value API responses carry', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = proxy(new NextRequest('https://toothlogy.example/find'));
    expect(response.headers.get('Strict-Transport-Security')).toBe(STRICT_TRANSPORT_SECURITY);
    expect(securityHeaders(true)['Strict-Transport-Security']).toBe(STRICT_TRANSPORT_SECURITY);
    expect(response.headers.get('Content-Security-Policy')).toContain("'strict-dynamic'");
  });

  it('sends no HSTS in development, which runs over plain HTTP', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = proxy(new NextRequest('http://localhost:3020/find'));
    expect(response.headers.get('Strict-Transport-Security')).toBeNull();
    expect(securityHeaders(false)['Strict-Transport-Security']).toBeUndefined();
  });
});
