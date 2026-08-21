/**
 * Whether a runtime registry satisfies a definition's pin.
 *
 * This exists because of a specific finding. The check was `pinned !== REGISTRY_VERSION`, and
 * registering the first new component in a while — `business.source-comparison`, FR-15 — turned a
 * backward-compatible addition into a `registryVersionSkew` problem logged on every load of every page.
 * That is how a real signal becomes noise nobody reads, and the noise would have arrived on the day the
 * platform did something entirely safe.
 *
 * The condition actually worth reporting is the one where a page can name a component the runtime does
 * not have: a runtime *behind* the pin, or a different major.
 */

import { describe, expect, it } from 'vitest';

import { registrySatisfies } from './page-loader.service';

describe('a minor bump is an addition, and additions are safe', () => {
  it('accepts a runtime that has since added components', () => {
    // The case that motivated this. A page authored against 1.1.0 references nothing that 1.2.0 added.
    expect(registrySatisfies('1.1.0', '1.2.0')).toBe(true);
  });

  it('accepts an exact match', () => {
    expect(registrySatisfies('1.2.0', '1.2.0')).toBe(true);
  });

  it('accepts a patch difference in either direction', () => {
    // A patch is a fix to a component that already existed, so neither direction can make a page name
    // something absent.
    expect(registrySatisfies('1.2.0', '1.2.3')).toBe(true);
    expect(registrySatisfies('1.2.3', '1.2.0')).toBe(true);
  });

  it('accepts a two-digit minor above the pin, rather than comparing as text', () => {
    // `'1.9.0' < '1.10.0'` is false as strings and true as versions. A string comparison here would
    // report skew for the tenth minor release and every one after it.
    expect(registrySatisfies('1.9.0', '1.10.0')).toBe(true);
  });

  it('accepts a pin with no patch segment', () => {
    expect(registrySatisfies('1.1', '1.2.0')).toBe(true);
  });
});

describe('what genuinely is skew', () => {
  it('refuses a runtime BEHIND the pin', () => {
    /*
      The real risk, and the reason the check exists at all: a page authored against a newer registry may
      reference a component this runtime does not have, which is exactly the condition an unknown
      component type appears under.
    */
    expect(registrySatisfies('1.2.0', '1.1.0')).toBe(false);
  });

  it('refuses a different major in either direction', () => {
    // A major bump is where a component's contract may have changed under a page that still names it.
    expect(registrySatisfies('1.9.0', '2.0.0')).toBe(false);
    expect(registrySatisfies('2.0.0', '1.9.0')).toBe(false);
  });

  it('refuses an unreadable version rather than staying quiet', () => {
    /*
      Reporting a skew nobody can parse is better than silence, because the silent answer is
      indistinguishable from agreement — a definition pinning nothing would otherwise look current.
    */
    expect(registrySatisfies(undefined, '1.2.0')).toBe(false);
    expect(registrySatisfies('', '1.2.0')).toBe(false);
    expect(registrySatisfies('latest', '1.2.0')).toBe(false);
    expect(registrySatisfies('1.2.0', 'unknown')).toBe(false);
  });
});
