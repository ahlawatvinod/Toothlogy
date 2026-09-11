/**
 * Make a value safe for a JSON response.
 *
 * Money in the ledger is `bigint` minor units, which `JSON.stringify` refuses
 * to encode. Converting to a string (never to a float) keeps every paisa exact
 * on the wire; the client formats it. Dates become ISO strings. Other class
 * instances with their own `toJSON` (Prisma's Decimal) use it.
 */
export function jsonSafe<T>(value: T): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => jsonSafe(v));
  if (value !== null && typeof value === 'object') {
    const isPlain = Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
    const withToJson = value as unknown as { toJSON?: () => unknown };
    if (!isPlain && typeof withToJson.toJSON === 'function') return withToJson.toJSON();
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, jsonSafe(v)]));
  }
  return value;
}
