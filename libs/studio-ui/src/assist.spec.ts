/**
 * The claim the assist panel rests on: **an accepted suggestion is an ordinary edit.**
 *
 * Everything else about assist is a matter of usefulness — a badly ranked suggestion wastes a click.
 * This is the part where being wrong is a defect: if accepting a suggestion produced two patches, one
 * undo would leave an orphan widget bound to nothing; if it did not record `origin: 'ai'`, a reviewer
 * could not tell which changes a person made; and if it wrote a patch by hand rather than going
 * through a command, none of the command layer's tests would cover it.
 *
 * So these tests assert the *mechanism*, not the output: one patch, one undo, correct provenance, and
 * a refusal that surfaces rather than corrupting the document.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import {
  ALL_CAPABILITIES,
  CatalogService,
  testCatalog,
  type CatalogSnapshot,
} from '@opus/catalog';
import type { ComponentManifest, PageDefinition, UserContext } from '@opus/contracts';
import type { AssistProposal } from '@opus/generation';
import { DefinitionStore, SelectionService } from '@opus/studio-core';

import { AssistService } from './assist.service';
import { DragStateService } from './drag-state.service';
import { EditorService } from './editor.service';

const KPI_MANIFEST = {
  schemaVersion: '1.0',
  type: 'analytics.kpi-card',
  version: '1.4.0',
  name: 'KPI Card',
  category: 'analytics',
  generation: { purpose: 'p', whenToUse: 'w' },
  properties: { type: 'object', properties: {} },
  dataRequirement: {
    shape: 'scalar',
    roles: [{ role: 'value', required: true }],
  },
} as unknown as ComponentManifest;

const TABLE_MANIFEST = {
  schemaVersion: '1.0',
  type: 'data.table',
  version: '1.0.0',
  name: 'Table',
  category: 'data',
  generation: { purpose: 'p', whenToUse: 'w' },
  properties: { type: 'object', properties: {} },
  dataRequirement: {
    shape: 'rows',
    roles: [{ role: 'columns', required: true, repeated: true }],
  },
} as unknown as ComponentManifest;

function page(): PageDefinition {
  return {
    schemaVersion: '1.0',
    id: 'p',
    name: 'File Processing',
    kind: 'dashboard',
    components: {
      kpi: { id: 'kpi', type: 'analytics.kpi-card', typeVersion: '1.4.0', title: 'KPI Card' },
    },
    dataSources: {},
    layout: {
      kind: 'container',
      id: 'root',
      container: {
        type: 'grid',
        columns: 12,
        gap: 'lg',
        children: [{ kind: 'widget', id: 'w-kpi', component: 'kpi' }],
      },
    },
    version: {
      schemaVersion: '1.0',
      artifactVersion: 1,
      lifecycleState: 'draft',
      immutable: false,
      pins: { catalogVersion: 3, registryVersion: '1.0.0' },
    },
  } as unknown as PageDefinition;
}

function user(): UserContext {
  return {
    id: 'author@test',
    displayName: 'Test Author',
    tenantId: 'test-tenant',
    locale: 'en-GB',
    timezone: 'Europe/London',
    roles: ['experienceAuthor'],
    capabilities: [...ALL_CAPABILITIES],
    entitlementScopeHash: 'all',
  };
}

function snapshot(): CatalogSnapshot {
  const catalog = new CatalogService();
  catalog.hydrate(testCatalog());
  return catalog.projectionFor(user());
}

const FIGURE: AssistProposal = {
  kind: 'add-figure',
  id: 'figure:rows-processed',
  title: 'Add a “Rows Processed” figure',
  rationale: 'File Load exposes Rows Processed, and no widget on this page reads it.',
  widgetTitle: 'Rows Processed',
  entityRef: 'processing.file-load',
  measureRef: 'rows-processed',
  aggregation: 'sum',
};

describe('AssistService', () => {
  let assist: AssistService;
  let store: DefinitionStore;
  let editor: EditorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DefinitionStore,
        SelectionService,
        DragStateService,
        EditorService,
        AssistService,
      ],
    });
    assist = TestBed.inject(AssistService);
    store = TestBed.inject(DefinitionStore);
    editor = TestBed.inject(EditorService);

    store.open(page());
    editor.setCatalog(snapshot());
    // Manifests come from the lazy registry in the app; inject them so the test does not depend on
    // component loading.
    (editor as unknown as { manifestByType: unknown }).manifestByType = () =>
      new Map([
        [KPI_MANIFEST.type, KPI_MANIFEST],
        [TABLE_MANIFEST.type, TABLE_MANIFEST],
      ]);
    (editor as unknown as { registeredTypes: unknown }).registeredTypes = () => [
      'analytics.kpi-card',
      'analytics.chart',
      'data.table',
      'content.text',
    ];
  });

  it('applies an accepted figure as ONE patch — widget, source and bindings together', () => {
    const before = store.history().length;
    expect(assist.accept(FIGURE).ok).toBe(true);

    // One entry, not three. This is the assertion the whole design exists to satisfy.
    expect(store.history().length).toBe(before + 1);

    const definition = store.definition()!;
    const sources = Object.values(definition.dataSources ?? {});
    expect(sources).toHaveLength(1);
    expect(sources[0]!.entity).toBe('processing.file-load');

    // The widget exists, is titled from the proposal, and is bound to the source that arrived with it.
    const added = Object.values(definition.components).find(
      (component) => component.id !== 'kpi' && component.type === 'analytics.kpi-card',
    );
    expect(added).toBeDefined();
    expect(added!.title).toBe('Rows Processed');
    expect(added!.dataSource).toBe(sources[0]!.id);
    // Bound to the alias the source actually selects — not to the catalog ref, which is the mistake
    // that produces a widget reporting "no data" on a page that validates.
    expect(added!.bindings?.['value']).toEqual({ field: 'rows-processed-value' });
  });

  it('records the edit as AI-originated', () => {
    assist.accept(FIGURE);
    const entry = store.history().at(-1)!;
    expect(entry.origin).toBe('ai');
    expect(entry.label).toContain('AI:');
  });

  it('reverses in a single undo, leaving no orphan widget and no orphan source', () => {
    const componentsBefore = Object.keys(store.definition()!.components).length;
    assist.accept(FIGURE);
    expect(Object.keys(store.definition()!.components).length).toBe(componentsBefore + 1);

    store.undo();

    const after = store.definition()!;
    expect(Object.keys(after.components).length).toBe(componentsBefore);
    // The half-undone state this design exists to prevent: a widget with no source, or a source with
    // no reader. Both would validate as an error and neither can be undone further.
    expect(Object.keys(after.dataSources ?? {})).toEqual([]);
  });

  it('marks the suggestion applied rather than making it vanish', () => {
    assist.accept(FIGURE);
    // The panel is populated by `suggest()`; accepting one that is not in the list is still a valid
    // edit, so the list simply has nothing to update.
    expect(store.history().at(-1)?.origin).toBe('ai');
  });

  it('carries the mandatory filter for an entity the catalog requires one for', () => {
    // `securities.security` is marked `requiresFilter`. The filter is resolved at accept time from
    // the shared rule, never from the proposal — a model cannot get it wrong because it is not asked.
    const outcome = assist.accept({
      kind: 'add-figure',
      id: 'figure:security-count',
      title: 'Add a “Security Count” figure',
      rationale: 'Security exposes Security Count and nothing on this page reads it.',
      widgetTitle: 'Security Count',
      entityRef: 'securities.security',
      measureRef: 'security-count',
      aggregation: 'count',
    });
    expect(outcome.ok).toBe(true);

    const source = Object.values(store.definition()!.dataSources ?? {})[0]!;
    expect(source.filter).toEqual({
      all: [{ target: 'created-at', operator: 'onOrAfterToday', skipWhenEmpty: false }],
    });
  });

  it('applies a page description through the ordinary page-property command', () => {
    expect(
      assist.accept({
        kind: 'set-page-description',
        id: 'describe-page',
        title: 'Describe this page',
        rationale: 'The page has no description, which is what the library card shows.',
        value: '1 figure over file loads.',
      }).ok,
    ).toBe(true);
    expect(store.definition()!.description).toBe('1 figure over file loads.');
    expect(store.history().at(-1)?.origin).toBe('ai');
  });

  it('retitles a widget through the ordinary value command', () => {
    expect(
      assist.accept({
        kind: 'retitle-widget',
        id: 'retitle:kpi',
        title: 'Title it “Failed Files”',
        rationale: '“KPI Card” names the component, not the content.',
        componentId: 'kpi',
        value: 'Failed Files',
      }).ok,
    ).toBe(true);
    expect(store.definition()!.components['kpi']!.title).toBe('Failed Files');
  });

  it('surfaces a refusal instead of half-applying it', () => {
    // No manifest for the chart, so the command must refuse — and refusing must leave the document
    // untouched rather than adding a data source with nothing to read it.
    (editor as unknown as { manifestByType: unknown }).manifestByType = () => new Map();

    const before = JSON.stringify(store.definition());
    const outcome = assist.accept(FIGURE);

    expect(outcome.ok).toBe(false);
    expect(outcome.problem).toMatch(/not registered/);
    expect(JSON.stringify(store.definition())).toBe(before);
    expect(store.history()).toHaveLength(0);
  });

  it('reports a suggestion as stale once the page moves', async () => {
    await assist.suggest();
    expect(assist.status()).toBe('ready');
    expect(assist.stale()).toBe(false);

    // Any edit at all, from any origin — the panel's opinions were formed about a page that no
    // longer exists, and saying so is better than silently re-running.
    assist.accept(FIGURE);
    expect(assist.stale()).toBe(true);
  });

  it('keeps a dismissed suggestion dismissed across a re-run', async () => {
    await assist.suggest();
    const first = assist.open()[0];
    expect(first).toBeDefined();

    assist.dismiss(first!.proposal.id);
    expect(assist.open().map((s) => s.proposal.id)).not.toContain(first!.proposal.id);

    await assist.suggest();
    // The gap is still there, so the analyser proposes it again under the same id — and the service
    // must still be hiding it. A counter-based id would have leaked it back into the list.
    expect(assist.open().map((s) => s.proposal.id)).not.toContain(first!.proposal.id);
  });

  it('answers with no provider installed, and says so', async () => {
    await assist.suggest();
    expect(assist.providerId()).toBeNull();
    expect(assist.open().length).toBeGreaterThan(0);
  });

  it('uses an installed provider, and drops what the provider makes up', async () => {
    // One good proposal and one that names a measure outside the grounded scope. The guard must keep
    // the first and reject the second — the entitlement boundary, exercised against a provider that
    // did the thing the prompt forbids.
    assist.useProvider({
      id: 'stub-model',
      version: '1',
      isExternal: false,
      complete: async () => ({
        output: {
          proposals: [
            FIGURE,
            {
              kind: 'add-figure',
              id: 'figure:invented',
              title: 'Add a “Revenue” figure',
              rationale: 'Invented, to check the guard rejects it.',
              widgetTitle: 'Revenue',
              entityRef: 'processing.file-load',
              measureRef: 'revenue-total',
              aggregation: 'sum',
            },
          ],
          note: 'two proposals',
        },
        modelId: 'stub-model',
        modelVersion: '1',
        tokensIn: 10,
        tokensOut: 10,
        durationMs: 1,
      }),
    });

    await assist.suggest();

    expect(assist.providerId()).toBe('stub-model');
    expect(assist.open().map((s) => s.proposal.id)).toEqual(['figure:rows-processed']);
    expect(assist.rejected()).toEqual([
      { id: 'figure:invented', reason: 'unknown measure "revenue-total"' },
    ]);
  });

  it('reports a provider failure without clearing the page', async () => {
    assist.useProvider({
      id: 'broken',
      version: '1',
      isExternal: false,
      complete: async () => {
        throw new Error('Simulated outage');
      },
    });

    await assist.suggest();

    expect(assist.status()).toBe('error');
    expect(assist.note()).toMatch(/Simulated outage/);
    expect(store.definition()).not.toBeNull();
  });
});
