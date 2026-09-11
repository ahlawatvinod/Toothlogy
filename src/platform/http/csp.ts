/**
 * Content Security Policy — dependency-free, so the request proxy can build it
 * without loading the rest of the HTTP layer.
 *
 * With a per-request nonce, scripts run only if they carry it (or were loaded
 * by one that did — `'strict-dynamic'`): an injected `<script>` without the
 * nonce does not execute, which turns a stored-XSS bug into a no-op. Next.js
 * puts the nonce on its own scripts; the root layout passes it to Toothlogy's
 * one inline script. JSON-LD blocks are data, not script, and are unaffected.
 *
 * `'unsafe-inline'` is permitted for styles only (Next.js and React set inline
 * style attributes). Development adds `'unsafe-eval'` for the dev server's
 * hot reload; production never has it.
 */
/**
 * HSTS, shared by API responses (security.ts) and pages (the proxy). Two years,
 * subdomains, preload-eligible. Production only: a browser remembers it, and
 * local development runs over plain HTTP.
 */
export const STRICT_TRANSPORT_SECURITY = 'max-age=63072000; includeSubDomains; preload';

export function contentSecurityPolicy(isProduction: boolean, nonce?: string): string {
  const scripts = ["'self'"];
  if (nonce) scripts.push(`'nonce-${nonce}'`);
  if (isProduction && nonce) scripts.push("'strict-dynamic'");
  if (!isProduction) scripts.push("'unsafe-eval'");

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scripts,
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  if (isProduction) directives['upgrade-insecure-requests'] = [];

  return Object.entries(directives)
    .map(([key, values]) => (values.length > 0 ? `${key} ${values.join(' ')}` : key))
    .join('; ');
}
