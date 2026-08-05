/**
 * @opus/component-library — the renderable vocabulary, and what the app is allowed to say about it.
 *
 * The components themselves are in `libs/components/*`, each with a manifest that is authoritative
 * for five consumers (renderer, validator, inspector, generator, and now this app's palette). This
 * library adds the one thing a manifest deliberately does not carry: **presentation metadata for
 * talking about a component** — the icon and the one-line description a palette needs.
 *
 * Why that is not in the manifest: a manifest is a contract consumed by a validator and a model, and
 * adding UI chrome to it would make every palette change a contract change. Why it is not inline in
 * the app: the app is not the only surface that lists components, and a second list would drift.
 *
 * The registry is re-exported rather than wrapped. A wrapper would have to re-implement lazy loading,
 * and the whole reason the registry exists is that components named by strings in JSON are invisible
 * to Angular's static analysis — the registry is the explicit map that makes code-splitting possible.
 */

export {
  REGISTRY_VERSION,
  isRegistered,
  loadAllManifests,
  registeredTypes,
  resolveComponent,
  type RegistryEntry,
  type ResolvedComponent,
} from '@opus/component-registry';

export {
  PALETTE,
  categoryLabel,
  paletteEntry,
  paletteForCategory,
  type PaletteEntry,
} from './palette';
