/**
 * TOOTHLOGY SERVER-SIDE AUTH
 *
 * Reading the current principal inside a server component or a server action.
 *
 * Separate from `session.ts` because this imports `next/headers`, which only
 * exists in a request scope. Keeping it out of the session module means the
 * session logic stays importable from tests, scripts and the retry worker —
 * none of which have a request.
 *
 * WHY PAGES RESOLVE THE SESSION THEMSELVES
 * The route handler does this for APIs, but a server component never passes
 * through `defineRoute`. Without this, page-level authorization would have to
 * be done in the client after loading — which means the data was already sent.
 */

import { cookies } from 'next/headers';
import { cache } from 'react';
import { hasDatabase } from '../config';
import { ANONYMOUS, type Principal, can, isAuthenticated } from '../rbac';
import { logger } from '../observability/logger';
import { SESSION_COOKIE, resolveSession } from './session';

/**
 * The current principal.
 *
 * Wrapped in React's `cache` so several components in one render share a single
 * database lookup. Without it, a layout, a header and a page each resolving the
 * session would issue three identical queries per request.
 */
/**
 * Next.js signals "this route reads request state" by THROWING from `cookies()`
 * during static analysis. That throw is control flow, not an error: catching it
 * would tell Next.js the route is static when it is not, and would flood the
 * build log with errors for pages that are working correctly.
 *
 * So it is re-thrown, and only genuine failures are handled.
 */
function isDynamicUsageSignal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('DYNAMIC_SERVER_USAGE');
}

export const currentPrincipal = cache(async (): Promise<Principal> => {
  if (!hasDatabase()) return ANONYMOUS;

  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    return await resolveSession(token);
  } catch (error) {
    if (isDynamicUsageSignal(error)) throw error;

    // A database blip must not turn every page into a 500. Degrading to
    // anonymous fails closed: the visitor sees the signed-out view.
    logger.error('Server-side session resolution failed', { error });
    return ANONYMOUS;
  }
});

/** The signed-in user's id, or null. */
export async function currentUserId(): Promise<string | null> {
  const principal = await currentPrincipal();
  return isAuthenticated(principal) ? principal.userId : null;
}

/**
 * Whether the current principal holds a permission.
 *
 * For conditional rendering — hiding an action the user cannot perform. This is
 * a UX affordance, NOT a security control: the API re-checks on every request,
 * because a hidden button is not an access control.
 */
export async function currentUserCan(
  permission: string,
  context: { organizationId?: string; subjectUserId?: string } = {},
): Promise<boolean> {
  return can(await currentPrincipal(), permission, context);
}
