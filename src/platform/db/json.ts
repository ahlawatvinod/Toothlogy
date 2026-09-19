/**
 * Reading list-shaped JSON columns.
 *
 * MySQL has no array column type and Prisma does not support scalar lists on
 * it, so the two lists the schema holds — `Address.lines` and
 * `DentistProfile.languages` — are `Json` columns containing a string array.
 * Prisma types those as `JsonValue`, which could be anything, so every read
 * goes through here rather than through a cast.
 *
 * WHY NOT A CAST
 * `profile.languages as string[]` compiles, and is true of every row this
 * application writes. It is also a promise the type system cannot check: a row
 * edited by hand, or written by a future import, can hold `null`, an object or
 * a string, and a cast passes that straight through to a `.map()` that throws
 * while rendering a public profile page.
 *
 * WHY NOT THROW
 * A malformed value is a data problem, not a reason to take a dentist's page
 * offline. It is logged so it surfaces, and the page renders without the list.
 */

import type { Prisma } from '@prisma/client';
import { logger } from '../observability/logger';

export function jsonStringArray(
  value: Prisma.JsonValue | null | undefined,
  context: string,
): string[] {
  if (value === null || value === undefined) return [];

  if (!Array.isArray(value)) {
    logger.warn('Expected a JSON string array', { context, receivedType: typeof value });
    return [];
  }

  const strings = value.filter((item): item is string => typeof item === 'string');
  if (strings.length !== value.length) {
    // Values themselves are not logged: address lines are personal data
    // (Constitution §9). The count is enough to find the row.
    logger.warn('Dropped non-string entries from a JSON string array', {
      context,
      dropped: value.length - strings.length,
    });
  }
  return strings;
}
