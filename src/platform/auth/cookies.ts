/**
 * TOOTHLOGY AUTH COOKIES
 *
 * The one place the session and MFA-challenge cookies are written, so their
 * attributes cannot drift between the four routes that set them (login,
 * restore, MFA verify, register).
 */

import type { CookieOptions } from '../http/handler';
import type { LoginResult } from './service';
import { SESSION_COOKIE, SESSION_TTL_DAYS, type CreatedSession } from './session';

export const MFA_CHALLENGE_COOKIE = 'tl_mfa';

/** Scoped to the MFA endpoint: no other route ever receives the challenge. */
const MFA_COOKIE_PATH = '/api/v1/auth/mfa';

type SetCookie = (name: string, value: string, options?: CookieOptions) => void;

export function setSessionCookie(session: CreatedSession, setCookie: SetCookie): void {
  setCookie(SESSION_COOKIE, session.token, {
    maxAgeSeconds: SESSION_TTL_DAYS * 24 * 3600,
    httpOnly: true,
    sameSite: 'lax',
  });
}

export function setLoginResultCookies(result: LoginResult, setCookie: SetCookie): void {
  if (result.kind === 'session') {
    setSessionCookie(result.session, setCookie);
    return;
  }
  setCookie(MFA_CHALLENGE_COOKIE, result.challengeToken, {
    maxAgeSeconds: Math.max(1, Math.floor((result.expiresAt.getTime() - Date.now()) / 1000)),
    httpOnly: true,
    // Strict: the challenge is only ever sent by our own MFA form.
    sameSite: 'strict',
    path: MFA_COOKIE_PATH,
  });
}

export function clearMfaChallengeCookie(clearCookie: (name: string, options?: { path?: string }) => void): void {
  clearCookie(MFA_CHALLENGE_COOKIE, { path: MFA_COOKIE_PATH });
}
