/**
 * @opus/component-registry
 *
 * The resolution to Angular's central tension with metadata-driven rendering
 * (architecture/frontend-architecture.md §5.2): components named by strings in
 * JSON are invisible to static analysis, so the bundle would either include
 * every component or miss the one it needs.
 *
 * An explicit map from component type to a dynamic `import()` fixes both. The
 * compiler and bundler can see every dynamically-reachable component and split
 * each into its own chunk, and the renderer never imports a component directly —
 * it resolves through here.
 *
 * ── GENERATED FILE (conceptually) ───────────────────────────────────────────
 * In the target architecture this file is generated from the component manifests
 * at build time: a component without a manifest is not registerable, and a
 * manifest without an implementation fails the build. M1 maintains it by hand and
 * asserts the two sides agree in registry.spec.ts. Generating it is a milestone-1
 * follow-up (docs/M1-IMPLEMENTATION.md §7).
 */

import type { Type } from '@angular/core';
import type { ComponentManifest, ComponentTypeRef } from '@opus/contracts';

export interface RegistryEntry {
  /** Lazily loads the component class and its manifest together. */
  load: () => Promise<{ component: Type<unknown>; manifest: ComponentManifest }>;
}

/** Registry version. Definitions pin this, so a component change cannot silently alter a live page. */
export const REGISTRY_VERSION = '1.1.0';

const ENTRIES: Readonly<Record<ComponentTypeRef, RegistryEntry>> = {
  'analytics.kpi-card': {
    load: async () => {
      const m = await import('@opus/components/kpi-card');
      return { component: m.KpiCardComponent, manifest: m.manifest as unknown as ComponentManifest };
    },
  },
  'data.table': {
    load: async () => {
      const m = await import('@opus/components/table');
      return { component: m.TableComponent, manifest: m.manifest as unknown as ComponentManifest };
    },
  },
  'analytics.chart': {
    load: async () => {
      const m = await import('@opus/components/chart');
      return { component: m.ChartComponent, manifest: m.manifest as unknown as ComponentManifest };
    },
  },
  'content.text': {
    load: async () => {
      const m = await import('@opus/components/text');
      return { component: m.TextComponent, manifest: m.manifest as unknown as ComponentManifest };
    },
  },
  'input.filter-bar': {
    load: async () => {
      const m = await import('@opus/components/filter-bar');
      return { component: m.FilterBarComponent, manifest: m.manifest as unknown as ComponentManifest };
    },
  },
};

export type ResolvedComponent = { component: Type<unknown>; manifest: ComponentManifest };

const resolved = new Map<ComponentTypeRef, ResolvedComponent>();
const inFlight = new Map<ComponentTypeRef, Promise<ResolvedComponent>>();

export function isRegistered(type: ComponentTypeRef): boolean {
  return Object.prototype.hasOwnProperty.call(ENTRIES, type);
}

export function registeredTypes(): ComponentTypeRef[] {
  return Object.keys(ENTRIES);
}

/** Synchronous lookup for a component already loaded. */
export function peek(type: ComponentTypeRef): ResolvedComponent | undefined {
  return resolved.get(type);
}

/**
 * Resolve a component type. Returns undefined for an unknown type rather than
 * throwing: registry/definition version skew must degrade to a placeholder
 * widget, never blank a page (architecture/runtime-architecture.md §10).
 */
export async function resolveComponent(
  type: ComponentTypeRef,
): Promise<ResolvedComponent | undefined> {
  const cached = resolved.get(type);
  if (cached) return cached;

  const pending = inFlight.get(type);
  if (pending) return pending;

  const entry = ENTRIES[type];
  if (!entry) return undefined;

  const promise = entry
    .load()
    .then((value) => {
      resolved.set(type, value);
      inFlight.delete(type);
      return value;
    })
    .catch((error: unknown) => {
      inFlight.delete(type);
      throw error;
    });

  inFlight.set(type, promise);
  return promise;
}

/** Load every manifest. Used by the validator and by the AI generation view. */
export async function loadAllManifests(): Promise<ComponentManifest[]> {
  const all = await Promise.all(registeredTypes().map((t) => resolveComponent(t)));
  return all.filter((r): r is ResolvedComponent => r !== undefined).map((r) => r.manifest);
}
