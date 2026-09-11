/**
 * TOOTHLOGY ENTERPRISE SIGN-IN PORT (Phase 12)
 *
 * Organizations with their own identity provider (OIDC or SAML) will sign
 * their staff in through it. No provider is connected: the slot is
 * NOT_CONFIGURED, the sign-in page offers no "sign in with your organization"
 * button, and nothing pretends otherwise (Constitution P10).
 *
 * Whatever adapter arrives, an enterprise identity may only ever sign in to
 * an existing Toothlogy account with the same verified email — never create
 * a second account for the same person.
 */

import { createProviderSlot } from '../integrations/provider';

export interface SsoStartRequest {
  readonly organizationId: string;
  /** Where to send the person after signing in — a path on Toothlogy. */
  readonly returnTo: string;
  /** Anti-forgery value the callback must echo. */
  readonly state: string;
}

export interface SsoIdentity {
  /** The provider's stable subject identifier. */
  readonly subject: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly displayName?: string;
}

export interface SsoPort {
  authorizationUrl(request: SsoStartRequest): Promise<string>;
  completeSignIn(callbackParams: Readonly<Record<string, string>>, expectedState: string): Promise<SsoIdentity>;
}

export const ssoProvider = createProviderSlot<SsoPort>('enterprise sign-in');
