/**
 * TOOTHLOGY FEATURE FLAGS
 *
 * Constitution §10: unfinished work ships behind a flag, defaulting to
 * `disabled` in production.
 *
 * This is what makes twelve phases of parallel work safe. Without flags, the
 * only way to keep unfinished work out of production is to keep it out of the
 * main branch — which produces long-lived branches, painful merges, and
 * integration problems discovered late. With flags, code merges early and
 * *exposure* is the thing that is controlled.
 *
 * Resolution order:
 *
 *   1. `TL_FLAG_<UPPER_KEY>` environment variable
 *   2. the registry default for the current environment
 *   3. `disabled`
 *
 * Step 3 is the important one. An unknown flag key resolves to disabled, never
 * enabled and never an exception. A typo in a flag name must fail toward *less*
 * exposure — the opposite default would turn a misspelling into an unintended
 * production launch.
 */

import { FLAG_BY_KEY } from '@/registry/flags';
import type { FlagState } from '@/registry/types';
import { getEnvironment } from '../config';

/**
 * Which states count as "on".
 *
 * `beta` is on: it means released to real users, with the flag retained as a
 * kill switch. `development` is on only in development, so work in progress is
 * visible to engineers and invisible to everyone else.
 */
function isOn(state: FlagState, environment: string): boolean {
  switch (state) {
    case 'enabled':
    case 'beta':
      return true;
    case 'development':
      return environment === 'development' || environment === 'test';
    case 'disabled':
    case 'deprecated':
      return false;
  }
}

function envOverrideFor(key: string): FlagState | null {
  const variable = `TL_FLAG_${key.toUpperCase()}`;
  const raw = process.env[variable];
  if (!raw) return null;

  const normalized = raw.trim().toLowerCase();
  // Accept boolean spellings as well as state names — an operator reaching for
  // a kill switch during an incident should not have to remember our vocabulary.
  if (normalized === 'true' || normalized === '1' || normalized === 'on') return 'enabled';
  if (normalized === 'false' || normalized === '0' || normalized === 'off') return 'disabled';

  const states: readonly FlagState[] = ['disabled', 'development', 'beta', 'enabled', 'deprecated'];
  return states.includes(normalized as FlagState) ? (normalized as FlagState) : null;
}

/** The resolved state of a flag, including where the value came from. */
export function resolveFlagState(key: string): {
  state: FlagState;
  source: 'env' | 'registry' | 'fallback';
} {
  const override = envOverrideFor(key);
  if (override) return { state: override, source: 'env' };

  const flag = FLAG_BY_KEY.get(key);
  if (!flag) return { state: 'disabled', source: 'fallback' };

  const environment = getEnvironment();
  return { state: flag.defaults[environment], source: 'registry' };
}

/** Is this capability on in the current environment? */
export function isFlagEnabled(key: string): boolean {
  const { state } = resolveFlagState(key);
  return isOn(state, getEnvironment());
}

/**
 * Every flag's resolved state.
 *
 * Used by the admin console and the introspection API. Returns state rather than
 * a boolean because "why is this off?" is answered by `deprecated` vs
 * `disabled` vs `development`, and a boolean throws that away.
 */
export function allFlagStates(): Record<string, { state: FlagState; enabled: boolean }> {
  const environment = getEnvironment();
  const out: Record<string, { state: FlagState; enabled: boolean }> = {};

  for (const key of FLAG_BY_KEY.keys()) {
    const { state } = resolveFlagState(key);
    out[key] = { state, enabled: isOn(state, environment) };
  }
  return out;
}

/**
 * Run a callback only when a flag is on.
 *
 * Keeps flag checks from spreading through business logic as bare `if`s, which
 * is how flags become permanent and unremovable.
 */
export function whenEnabled<T>(key: string, fn: () => T): T | undefined {
  return isFlagEnabled(key) ? fn() : undefined;
}
