/**
 * TOOTHLOGY PROVIDER SLOTS
 *
 * The mechanism behind Constitution P10: *no fake success*.
 *
 * Every external capability — email, SMS, payments, storage, maps, search — is
 * declared as a port (a TypeScript interface) and filled by an adapter at boot.
 * Until an adapter is registered, the slot is empty.
 *
 * The question is what an empty slot should do. Three options, and only one is
 * acceptable:
 *
 * - Return a fake success. **Forbidden.** This is how "your appointment is
 *   confirmed" gets shown for a confirmation email that was never sent. The
 *   failure surfaces days later, to a patient, in the worst possible way.
 * - Return `null` and make every caller handle it. Every call site grows a null
 *   check, and the one that is forgotten silently does nothing.
 * - **Throw a typed `NOT_CONFIGURED` error.** The failure is immediate, loud,
 *   attributable to a named integration, and maps to a 503 that says exactly
 *   what is missing.
 *
 * A slot returns a Proxy that throws on any method call while empty, so the
 * guarantee holds for every method of every port without a single line of
 * per-method boilerplate — including methods added years from now.
 */

import { errors } from '../kernel/errors';

export interface ProviderSlot<T extends object> {
  /**
   * The provider. Never null: while unconfigured this is a proxy whose every
   * method throws `NOT_CONFIGURED`, so calling code needs no null handling and
   * cannot accidentally skip the failure.
   */
  get(): T;
  /** Install an adapter at boot. Pass `null` to clear (used by tests). */
  set(implementation: T | null): void;
  /** Whether a real adapter is installed. Used by health checks and diagnostics. */
  isConfigured(): boolean;
  readonly integrationName: string;
}

export function createProviderSlot<T extends object>(integrationName: string): ProviderSlot<T> {
  let implementation: T | null = null;

  /**
   * Stands in for an absent adapter.
   *
   * Property access returns a function rather than throwing on access itself,
   * so `typeof provider.send === 'function'` and destructuring behave normally
   * and the failure lands at the call, where it is diagnosable.
   *
   * That function returns a **rejected promise** rather than throwing
   * synchronously. Every port method is declared `Promise<…>`, and runtime
   * behaviour must match the declared type: a synchronous throw would escape
   * `provider.send(...).catch(...)` entirely, surfacing as an uncaught
   * exception in a caller that had, by its own reading of the types, handled
   * the error correctly.
   */
  const unconfigured = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') return undefined; // not a thenable
        if (property === Symbol.toStringTag) return `Unconfigured(${integrationName})`;
        return () => Promise.reject(errors.notConfigured(integrationName));
      },
    },
  ) as T;

  return {
    integrationName,
    get: () => implementation ?? unconfigured,
    set: (next) => {
      implementation = next;
    },
    isConfigured: () => implementation !== null,
  };
}
