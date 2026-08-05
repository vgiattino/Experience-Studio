import { describe, expect, it } from 'vitest';
import { registeredTypes } from '@opus/component-registry';

import { PALETTE, paletteEntry } from './palette';

describe('palette', () => {
  it('describes every registered component type', () => {
    // A component added without a palette entry would render as a blank tile in the Create screen's
    // vocabulary panel, which reads as a broken app rather than as a missing description.
    const missing = registeredTypes().filter((type) => !paletteEntry(type));
    expect(missing).toEqual([]);
  });

  it('describes nothing that is not registered', () => {
    // The opposite drift: an entry for a type the registry no longer serves would promise a
    // capability the generator cannot emit.
    const registered = new Set(registeredTypes());
    expect(PALETTE.filter((entry) => !registered.has(entry.type)).map((e) => e.type)).toEqual([]);
  });

  it('gives every entry something a user could type to get it', () => {
    for (const entry of PALETTE) {
      expect(entry.generates, entry.type).toBeTruthy();
      expect(entry.description, entry.type).toBeTruthy();
      expect(entry.icon, entry.type).toBeTruthy();
    }
  });
});
