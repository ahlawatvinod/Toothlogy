/**
 * Fallback for /api paths that match no endpoint.
 *
 * Without it Next.js answers an unknown API path with the HTML 404 page, so a
 * client that parses JSON gets markup. This answers every method with the
 * standard error envelope (404 NOT_FOUND) and the API security headers. It is
 * not an endpoint: nothing is registered for it and it reads nothing. Real
 * routes are more specific and always win.
 */

import { errorResponse } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

function notFound() {
  return errorResponse(errors.notFound('API endpoint'));
}

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
