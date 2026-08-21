import { describe, expect, it } from 'vitest';

import { isRegistered, loadAllManifests, registeredTypes, resolveComponent } from './index';

/**
 * The registry is a generated artifact in the target architecture: a component
 * without a manifest is not registerable, and a manifest without an implementation
 * fails the build. M1 maintains it by hand, so these tests stand in for that
 * generation step — they are what stops the two sides drifting.
 */
describe('component registry', () => {
  it('registers the component vocabulary', () => {
    expect(registeredTypes().sort()).toEqual([
      'analytics.chart',
      'analytics.kpi-card',
      // The first of the PRD's Enterprise family (FR-30). `business` is the contract's name for that
      // family; the PRD calls it Enterprise, and the mismatch is recorded in PRD-TRACEABILITY.md.
      'business.exception-queue',
      // FR-15, and the one entry in §7's list of common capabilities that had no component at all.
      'business.source-comparison',
      'content.text',
      'data.table',
      // Added with the EDM business templates: search was the one journey the vocabulary could
      // not express, so the templates could not have demonstrated it without a component.
      'input.filter-bar',
    ]);
  });

  it('reports an unknown type rather than throwing', () => {
    // Registry / definition version skew must degrade to a placeholder, never a
    // blank page — so lookup has to be a question, not an assertion.
    expect(isRegistered('analytics.nonexistent')).toBe(false);
  });

  it('resolves an unknown type to undefined', async () => {
    await expect(resolveComponent('analytics.nonexistent')).resolves.toBeUndefined();
  });

  it('loads a component class and its manifest together', async () => {
    const resolved = await resolveComponent('analytics.kpi-card');
    expect(resolved).toBeDefined();
    expect(typeof resolved!.component).toBe('function');
    expect(resolved!.manifest.type).toBe('analytics.kpi-card');
  });

  it('memoizes resolution', async () => {
    const first = await resolveComponent('data.table');
    const second = await resolveComponent('data.table');
    expect(second).toBe(first);
  });

  it('every registry entry has a manifest whose type matches its key', async () => {
    for (const type of registeredTypes()) {
      const resolved = await resolveComponent(type);
      expect(resolved, `${type} failed to resolve`).toBeDefined();
      expect(resolved!.manifest.type).toBe(type);
    }
  });

  it('every manifest declares the bundle path the registry actually imports', async () => {
    const manifests = await loadAllManifests();
    for (const manifest of manifests) {
      expect(manifest.bundle.libraryPath).toMatch(/^@opus\/components\//);
      expect(manifest.bundle.exportName).toMatch(/Component$/);
    }
  });

  it('every manifest implements the loading and ready states at minimum', async () => {
    const manifests = await loadAllManifests();
    for (const manifest of manifests) {
      expect(manifest.states, manifest.type).toContain('ready');
      if (manifest.dataRequirement.shape !== 'none') {
        // A data-bound component must be able to say "loading", "nothing here",
        // "not available to you" and "this failed".
        for (const state of ['loading', 'empty', 'error', 'denied'] as const) {
          expect(manifest.states, `${manifest.type} missing ${state}`).toContain(state);
        }
      }
    }
  });

  it('every manifest declares an accessibility contract', async () => {
    const manifests = await loadAllManifests();
    for (const manifest of manifests) {
      expect(['AA', 'AAA'], manifest.type).toContain(manifest.accessibility.wcagLevel);
      expect(manifest.accessibility.keyboardContract, manifest.type).toBeTruthy();
    }
  });

  it('every data-bound manifest declares at least one required role', async () => {
    const manifests = await loadAllManifests();
    for (const manifest of manifests) {
      if (manifest.dataRequirement.shape === 'none') continue;
      const roles = manifest.dataRequirement.roles ?? [];
      expect(roles.some((r) => r.required), `${manifest.type} has no required role`).toBe(true);
    }
  });

  it('every manifest carries the AI generation view', async () => {
    const manifests = await loadAllManifests();
    for (const manifest of manifests) {
      // The reduced projection is the vocabulary the generator may emit; a component
      // without it cannot be generated correctly.
      expect(manifest.generation.purpose, manifest.type).toBeTruthy();
      expect(manifest.generation.whenToUse, manifest.type).toBeTruthy();
    }
  });
});
