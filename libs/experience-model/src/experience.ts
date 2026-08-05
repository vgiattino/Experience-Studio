/**
 * Experience-level helpers: outlines, page resolution, and the empty artifact a new draft starts from.
 *
 * The outline functions exist because the prototype shows the *structure* of a generated experience
 * as prominently as it shows the rendered result. That is not decoration: a business user who can
 * see "four KPIs, two charts, one table, bound to three entities" can tell whether the system
 * understood them, without reading JSON and without waiting for data to load.
 */

import type {
  ComponentTypeRef,
  ExperienceDefinition,
  I18nString,
  Identifier,
  PageDefinition,
} from '@opus/contracts';
import { isPageRef } from '@opus/contracts';

import { componentIdsOf, sectionsOf, widgetNodesOf } from './section';
import { DRAFT_VERSION } from './version';

/** Resolve an i18n string to display text. */
export function text(value: I18nString | undefined, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value;
  return value.default ?? fallback;
}

export function pageIdsOf(experience: ExperienceDefinition): Identifier[] {
  return Object.keys(experience.pages ?? {});
}

/**
 * The page, or null when it is stored by reference.
 *
 * A `$pageRef` is legitimate in the schema — a large experience must not be one unreviewable
 * document — but this prototype's store resolves refs at write time, so a ref reaching here means
 * the caller is holding a definition that came from somewhere else. Returning null rather than
 * throwing lets the UI say so instead of failing.
 */
export function pageOf(experience: ExperienceDefinition, pageId: Identifier): PageDefinition | null {
  const entry = experience.pages?.[pageId];
  if (!entry || isPageRef(entry)) return null;
  return entry as PageDefinition;
}

export function pageTitle(experience: ExperienceDefinition, pageId: Identifier): string {
  const page = pageOf(experience, pageId);
  return page ? text(page.name, pageId) : pageId;
}

export function dataSourceIdsOf(page: PageDefinition): Identifier[] {
  return Object.keys(page.dataSources ?? {});
}

export function countWidgets(page: PageDefinition): number {
  return widgetNodesOf(page.layout).length;
}

export function usedComponentTypes(page: PageDefinition): ComponentTypeRef[] {
  const ids = new Set(componentIdsOf(page.layout));
  const types = new Set<ComponentTypeRef>();
  for (const id of ids) {
    const instance = page.components?.[id];
    if (instance) types.add(instance.type);
  }
  return [...types];
}

export interface PageOutline {
  id: Identifier;
  name: string;
  kind: string;
  widgets: number;
  sections: number;
  dataSources: number;
  actions: number;
  componentTypes: ComponentTypeRef[];
  entities: string[];
  parameters: Identifier[];
  filters: Identifier[];
}

export interface ExperienceOutline {
  id: string;
  name: string;
  description: string;
  kind: string;
  pages: PageOutline[];
  totalWidgets: number;
  entities: string[];
  origin: string;
  prompt?: string;
}

/** A structural summary of an experience, for the UI to show instead of raw JSON. */
export function describeExperience(experience: ExperienceDefinition): ExperienceOutline {
  const pages: PageOutline[] = [];
  const allEntities = new Set<string>();

  for (const pageId of pageIdsOf(experience)) {
    const page = pageOf(experience, pageId);
    if (!page) continue;
    const entities = new Set<string>();
    for (const source of Object.values(page.dataSources ?? {})) entities.add(source.entity);
    for (const entity of entities) allEntities.add(entity);

    pages.push({
      id: pageId,
      name: text(page.name, pageId),
      kind: page.kind,
      widgets: countWidgets(page),
      sections: sectionsOf(page.layout).length,
      dataSources: dataSourceIdsOf(page).length,
      actions: Object.keys(page.actions ?? {}).length,
      componentTypes: usedComponentTypes(page),
      entities: [...entities],
      parameters: Object.keys(page.parameters ?? {}),
      filters: Object.keys(page.filters ?? {}),
    });
  }

  return {
    id: experience.id,
    name: text(experience.name, experience.id),
    description: text(experience.description),
    kind: experience.kind ?? 'application',
    pages,
    totalWidgets: pages.reduce((n, p) => n + p.widgets, 0),
    entities: [...allEntities],
    origin: experience.version?.provenance?.origin ?? 'human',
    prompt: experience.version?.provenance?.generation?.prompt,
  };
}

/**
 * Wrap a page as a single-page experience.
 *
 * The generator produces a *page*; the app renders *experiences*. Rather than teach the app to
 * handle both shapes — which would put a branch on every route, every save and every render — one
 * page becomes a one-page experience here. The experience is the unit of publication and the unit
 * that carries navigation, so there is nothing to lose by always having one.
 */
export function experienceOf(
  page: PageDefinition,
  overrides: {
    id?: string;
    name?: I18nString;
    description?: I18nString;
    homePage?: Identifier;
  } = {},
): ExperienceDefinition {
  const id = overrides.id ?? page.id;
  return {
    schemaVersion: page.schemaVersion,
    id,
    name: overrides.name ?? page.name,
    description: overrides.description ?? page.description,
    kind: 'single',
    pages: { [page.id]: page },
    navigation: {
      mode: 'none',
      items: [{ kind: 'page', id: `nav-${page.id}`, label: page.name, page: page.id }],
      homePage: overrides.homePage ?? page.id,
    },
    parameters: page.parameters as ExperienceDefinition['parameters'],
    version: page.version,
    tags: page.tags,
  };
}

/** Add or replace a page, returning a new definition. Never mutates the input. */
export function withPage(
  experience: ExperienceDefinition,
  page: PageDefinition,
): ExperienceDefinition {
  return { ...experience, pages: { ...experience.pages, [page.id]: page } };
}

export function emptyExperience(id: string, name: string): ExperienceDefinition {
  return {
    schemaVersion: '1.0',
    id,
    name,
    kind: 'application',
    pages: {},
    navigation: { mode: 'sidebar', items: [] },
    version: DRAFT_VERSION(),
  };
}
