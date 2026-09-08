/**
 * TL-TEST-FLAGS-001 — Feature flags
 *
 * The critical property: an unknown flag key resolves to *disabled*. A typo in
 * a flag name must fail toward less exposure, because the opposite default
 * turns a misspelling into an unintended production launch.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { allFlagStates, isFlagEnabled, resolveFlagState, whenEnabled } from '@/platform/flags';
import { FEATURE_FLAGS } from '@/registry/flags';

const TOUCHED_ENV_KEYS: string[] = [];

function setFlagEnv(key: string, value: string) {
  const variable = `TL_FLAG_${key.toUpperCase()}`;
  TOUCHED_ENV_KEYS.push(variable);
  process.env[variable] = value;
}

afterEach(() => {
  for (const key of TOUCHED_ENV_KEYS) delete process.env[key];
  TOUCHED_ENV_KEYS.length = 0;
});

describe('unknown flags', () => {
  it('resolves an unregistered key to disabled', () => {
    expect(isFlagEnabled('no_such_flag')).toBe(false);
    expect(resolveFlagState('no_such_flag')).toEqual({ state: 'disabled', source: 'fallback' });
  });

  it('does not throw on an unknown key', () => {
    // A flag check appears on request paths; throwing would turn a typo into
    // an outage rather than a hidden feature.
    expect(() => isFlagEnabled('')).not.toThrow();
  });
});

describe('registry defaults', () => {
  it('resolves from the registry for the current environment', () => {
    // NODE_ENV is 'test' in this suite (see tests/setup.ts).
    const resolved = resolveFlagState('design_system_reference');
    expect(resolved.source).toBe('registry');
    expect(resolved.state).toBe('enabled');
  });

  it('treats beta as on and disabled as off', () => {
    expect(isFlagEnabled('design_system_reference')).toBe(true);
    expect(isFlagEnabled('multi_locale_routing')).toBe(false);
  });

  it('defaults uncertified capabilities to disabled in production', () => {
    // Constitution §10. The registry is the record; this asserts it holds.
    const designSystem = FEATURE_FLAGS.find((f) => f.key === 'design_system_reference');
    expect(designSystem?.defaults.production).toBe('disabled');

    const verboseHealth = FEATURE_FLAGS.find((f) => f.key === 'verbose_health_check');
    expect(verboseHealth?.defaults.production).toBe('disabled');
  });
});

describe('environment overrides', () => {
  it('lets an env var override the registry default', () => {
    setFlagEnv('multi_locale_routing', 'enabled');
    expect(resolveFlagState('multi_locale_routing').source).toBe('env');
    expect(isFlagEnabled('multi_locale_routing')).toBe(true);
  });

  it('accepts boolean spellings as well as state names', () => {
    // An operator reaching for a kill switch during an incident should not have
    // to remember our vocabulary.
    setFlagEnv('design_system_reference', 'off');
    expect(isFlagEnabled('design_system_reference')).toBe(false);

    setFlagEnv('design_system_reference', 'true');
    expect(isFlagEnabled('design_system_reference')).toBe(true);

    setFlagEnv('design_system_reference', '0');
    expect(isFlagEnabled('design_system_reference')).toBe(false);
  });

  it('ignores an unparseable override and falls back to the registry', () => {
    setFlagEnv('design_system_reference', 'maybe');
    expect(resolveFlagState('design_system_reference').source).toBe('registry');
  });

  it('can disable a capability without a deploy', () => {
    setFlagEnv('registry_introspection_api', 'disabled');
    expect(isFlagEnabled('registry_introspection_api')).toBe(false);
  });
});

describe('helpers', () => {
  it('runs a callback only when enabled', () => {
    expect(whenEnabled('design_system_reference', () => 'ran')).toBe('ran');
    expect(whenEnabled('multi_locale_routing', () => 'ran')).toBeUndefined();
  });

  it('reports state and enabled-ness for every registered flag', () => {
    // State, not just a boolean: "why is this off?" is answered by
    // deprecated vs disabled vs development.
    const states = allFlagStates();
    expect(Object.keys(states).sort()).toEqual(FEATURE_FLAGS.map((f) => f.key).sort());

    for (const value of Object.values(states)) {
      expect(typeof value.enabled).toBe('boolean');
      expect(typeof value.state).toBe('string');
    }
  });
});
