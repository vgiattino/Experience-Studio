import { describe, expect, it } from 'vitest';
import type {
  Action,
  ComponentInstance,
  ComponentManifest,
  DataSource,
  FilterChannel,
  PageDefinition,
  PageParameter,
  SelectionChannel,
} from '@opus/contracts';

import { validatePage } from './validate-page';

import kpiManifest from '../../components/kpi-card/kpi-card.manifest.json';
import tableManifest from '../../components/table/table.manifest.json';
import textManifest from '../../components/text/text.manifest.json';

const MANIFESTS = [kpiManifest, tableManifest, textManifest] as unknown as ComponentManifest[];
const REGISTERED = MANIFESTS.map((m) => m.type);

/**
 * A page definition with mutable maps. The runtime types are deliberately readonly —
 * a stored definition is immutable — but these tests must build malformed variants,
 * which is exactly the untrusted JSON the validator exists to reject.
 */
interface MutablePage
  extends Omit<
    PageDefinition,
    'components' | 'actions' | 'dataSources' | 'filters' | 'parameters' | 'selections'
  > {
  components: Record<string, ComponentInstance>;
  actions?: Record<string, Action>;
  dataSources?: Record<string, DataSource>;
  filters?: Record<string, FilterChannel>;
  parameters?: Record<string, PageParameter>;
  selections?: Record<string, SelectionChannel>;
}

function base(): MutablePage {
  return {
    schemaVersion: '1.0',
    id: 'valid-page',
    name: 'Valid page',
    kind: 'dashboard',
    parameters: { 'as-of': { dataType: 'date' } },
    filters: { severity: { dataType: 'enum', multiValued: true } },
    selections: { focused: { mode: 'single' } },
    dataSources: {
      totals: {
        id: 'totals',
        entity: 'dq.exception',
        kind: 'aggregate',
        select: { measures: [{ measure: 'exception-count', aggregation: 'count', alias: 'total' }] },
        filter: { all: [{ target: 'severity', operator: 'in', value: { $filter: 'severity' } }] },
      },
    },
    components: {
      kpi: {
        id: 'kpi',
        type: 'analytics.kpi-card',
        typeVersion: '1.4.0',
        title: 'Open exceptions',
        dataSource: 'totals',
        config: { size: 'md' },
        bindings: { value: { field: 'total' } },
      },
    },
    layout: {
      kind: 'container',
      id: 'root',
      container: { type: 'grid', children: [{ kind: 'widget', id: 'w-kpi', component: 'kpi' }] },
    },
    actions: {
      'clear-all': { id: 'clear-all', kind: 'clearFilters', label: 'Clear' },
    },
    version: {
      schemaVersion: '1.0',
      artifactVersion: 1,
      lifecycleState: 'published',
      pins: { catalogVersion: 7, registryVersion: '1.0.0' },
    },
  };
}

const run = (page: unknown) =>
  validatePage(page, { manifests: MANIFESTS, registeredTypes: REGISTERED });

const codes = (page: unknown) => run(page).findings.map((f) => f.code);

describe('a well-formed page', () => {
  it('passes every level M1 can run', () => {
    const report = run(base());
    expect(report.valid).toBe(true);
    expect(report.levelsRun).toEqual(['structural', 'component', 'binding', 'layout']);
  });

  it('names the levels it did not run rather than implying they passed', () => {
    const report = run(base());
    expect(report.levelsNotRun).toEqual(['semantic', 'entitlement', 'cost', 'accessibility']);
  });
});

describe('level 1 — structural', () => {
  it('rejects an invented top-level property', () => {
    const page = { ...base(), colour: 'red' };
    const report = run(page);
    expect(report.valid).toBe(false);
    expect(report.findings[0]!.code).toBe('schema.additionalProperties');
  });

  it('stops after a structural failure, since deeper levels would be meaningless', () => {
    const report = run({ ...base(), layout: 'not-a-node' });
    expect(report.levelsRun).toEqual(['structural']);
  });

  it('requires a version envelope', () => {
    const page = base() as unknown as Record<string, unknown>;
    delete page['version'];
    expect(run(page).valid).toBe(false);
  });
});

describe('level 2 — component', () => {
  it('rejects an unregistered component type', () => {
    const page = base();
    page.components['kpi']!.type = 'analytics.nonexistent';
    expect(codes(page)).toContain('component.unknownType');
  });

  it('rejects a config property the manifest does not declare', () => {
    // This is the check a static schema cannot express: instance config against the
    // manifest resolved from (type, typeVersion).
    const page = base();
    (page.components['kpi']!.config as Record<string, unknown>)['colour'] = 'red';
    expect(codes(page)).toContain('config.additionalProperties');
  });

  it('rejects a config value outside the manifest enum', () => {
    const page = base();
    (page.components['kpi']!.config as Record<string, unknown>)['size'] = 'enormous';
    expect(codes(page)).toContain('config.enum');
  });

  it('flags a component id that disagrees with its map key', () => {
    const page = base();
    page.components['kpi']!.id = 'something-else';
    expect(codes(page)).toContain('component.idMismatch');
  });

  it('requires the accessibility labels the manifest declares', () => {
    const page = base();
    delete page.components['kpi']!.title;
    expect(codes(page)).toContain('component.missingRequiredLabel');
  });

  it('warns on a compatible version drift and errors on an incompatible one', () => {
    const drift = base();
    drift.components['kpi']!.typeVersion = '1.2.0';
    const driftReport = run(drift);
    expect(driftReport.valid).toBe(true);
    expect(driftReport.findings.map((f) => f.code)).toContain('component.versionDrift');

    const breaking = base();
    breaking.components['kpi']!.typeVersion = '2.0.0';
    expect(run(breaking).valid).toBe(false);
  });
});

describe('level 4 — binding', () => {
  it('rejects a field that is not an alias of the data source', () => {
    const page = base();
    page.components['kpi']!.bindings = { value: { field: 'not-selected' } };
    expect(codes(page)).toContain('binding.unknownField');
  });

  it('rejects a role the component does not declare', () => {
    const page = base();
    page.components['kpi']!.bindings = { value: { field: 'total' }, nonsense: { field: 'total' } };
    expect(codes(page)).toContain('binding.unknownRole');
  });

  it('requires a binding for a required role', () => {
    const page = base();
    page.components['kpi']!.bindings = {};
    expect(codes(page)).toContain('binding.missingRequiredRole');
  });

  it('rejects an undeclared data source', () => {
    const page = base();
    page.components['kpi']!.dataSource = 'ghost';
    expect(codes(page)).toContain('binding.unknownDataSource');
  });

  it('rejects several bindings on a non-repeatable role', () => {
    const page = base();
    page.components['kpi']!.bindings = {
      value: [{ field: 'total' }, { field: 'total' }],
    };
    expect(codes(page)).toContain('binding.notRepeatable');
  });
});

describe('level 7 — layout and references', () => {
  it('rejects a widget referencing an undeclared component', () => {
    const page = base();
    page.layout = {
      kind: 'container',
      id: 'root',
      container: { type: 'grid', children: [{ kind: 'widget', id: 'w', component: 'ghost' }] },
    };
    expect(codes(page)).toContain('layout.unknownComponent');
  });

  it('warns about a component that is never placed', () => {
    const page = base();
    page.components['orphan'] = {
      id: 'orphan',
      type: 'content.text',
      typeVersion: '1.0.0',
      title: 'Orphan',
    };
    const report = run(page);
    expect(report.findings.map((f) => f.code)).toContain('layout.orphanComponent');
    expect(report.valid).toBe(true); // a warning, not an error
  });

  it('rejects a duplicate layout node id', () => {
    const page = base();
    page.layout = {
      kind: 'container',
      id: 'dup',
      container: {
        type: 'grid',
        children: [
          { kind: 'widget', id: 'dup', component: 'kpi' },
          { kind: 'widget', id: 'w2', component: 'kpi' },
        ],
      },
    };
    expect(codes(page)).toContain('layout.duplicateNodeId');
  });

  it('rejects an event mapped to an undeclared action', () => {
    const page = base();
    page.components['kpi']!.eventActions = { activated: 'ghost-action' };
    expect(codes(page)).toContain('layout.unknownAction');
  });

  it('rejects writesTo pointing at an undeclared channel', () => {
    const page = base();
    page.components['kpi']!.writesTo = { filters: ['ghost'] };
    expect(codes(page)).toContain('layout.unknownFilterChannel');
  });

  it('rejects a $filter wrapper naming an undeclared channel', () => {
    const page = base();
    page.dataSources!['totals']!.filter = {
      all: [{ target: 'severity', operator: 'in', value: { $filter: 'ghost' } }],
    };
    expect(codes(page)).toContain('reference.unknownFilterChannel');
  });

  it('rejects a tab channel that is not a declared filter', () => {
    const page = base();
    page.layout = {
      kind: 'container',
      id: 'root',
      container: {
        type: 'tabs',
        selectedTabChannel: 'ghost',
        source: {
          mode: 'static',
          tabs: [{ id: 't', label: 'T', content: [{ kind: 'widget', id: 'w', component: 'kpi' }] }],
        },
      },
    };
    expect(codes(page)).toContain('layout.unknownFilterChannel');
  });
});

describe('expressions are validated at design time', () => {
  it('rejects a syntactically invalid expression with a path', () => {
    const page = base();
    page.components['kpi']!.visible = { $expr: '$row.a-$row.b' };
    const finding = run(page).findings.find((f) => f.code === 'expression.syntax');
    expect(finding).toBeDefined();
    expect(finding!.path).toContain('/components/kpi/visible');
  });

  it('rejects an expression referencing an undeclared data source', () => {
    const page = base();
    page.components['kpi']!.visible = { $expr: '$data.ghost.value > 0' };
    expect(codes(page)).toContain('expression.unknownDataSource');
  });

  it('rejects an expression calling an unknown function', () => {
    const page = base();
    page.components['kpi']!.visible = { $expr: 'bogus(1)' };
    expect(codes(page)).toContain('expression.syntax');
  });
});

describe('actions', () => {
  it('rejects the reserved write-back kind', () => {
    const page = base();
    page.actions!['write'] = {
      id: 'write',
      kind: 'invoke',
      operation: 'dq.override',
    } as never;
    const report = run(page);
    expect(report.valid).toBe(false);
    expect(report.findings.map((f) => f.code)).toContain('action.reservedKind');
  });

  it('rejects the reserved workflow kind', () => {
    const page = base();
    page.actions!['approve'] = {
      id: 'approve',
      kind: 'workflow',
      operation: 'approve',
    } as never;
    expect(codes(page)).toContain('action.reservedKind');
  });

  it('rejects a setFilter naming an undeclared channel', () => {
    const page = base();
    page.actions!['bad'] = { id: 'bad', kind: 'setFilter', channel: 'ghost', value: 'x' };
    expect(codes(page)).toContain('action.unknownFilterChannel');
  });

  it('rejects a composite step that does not exist', () => {
    const page = base();
    page.actions!['combo'] = { id: 'combo', kind: 'composite', steps: ['ghost'] };
    expect(codes(page)).toContain('action.unknownStep');
  });

  it('rejects a composite action that includes itself', () => {
    const page = base();
    page.actions!['combo'] = { id: 'combo', kind: 'composite', steps: ['combo'] };
    expect(codes(page)).toContain('action.selfReference');
  });

  it('rejects an export action on a page whose policy forbids export', () => {
    const page = base();
    page.security = { exportPolicy: { allowed: false } };
    page.actions!['dump'] = {
      id: 'dump',
      kind: 'export',
      dataSource: 'totals',
      format: 'csv',
    };
    expect(codes(page)).toContain('action.exportForbidden');
  });
});
