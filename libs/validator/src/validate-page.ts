/**
 * The shared page validator.
 *
 * One implementation, several consumers: the JSON page loader runs it at load, the
 * Studio will run it continuously while editing, and the AI repair loop will run
 * it between attempts. Sharing it is what makes all three agree — a definition the
 * Studio accepts cannot be one the loader rejects.
 */

import {
  RESERVED_ACTION_KINDS,
  isExpression,
  isFilterRef,
  isParamRef,
  isSelectionRef,
  type Action,
  type ComponentInstance,
  type ComponentManifest,
  type DataSource,
  type FieldBinding,
  type LayoutNode,
  type PageDefinition,
} from '@opus/contracts';
import { ExpressionSyntaxError, collectReferences, parseExpression } from '@opus/platform';

import { compileSubSchema, validatorFor } from './schema-registry';
import { summarize, type ValidationFinding, type ValidationLevel, type ValidationReport } from './types';

export interface PageValidationOptions {
  /** Manifests for the component types the page uses. Enables level 2 and level 4. */
  manifests?: readonly ComponentManifest[];
  /** Component types the registry knows about. Enables the unknown-type check. */
  registeredTypes?: readonly string[];
  /** Skip the ajv pass — used when a caller has already validated structurally. */
  skipStructural?: boolean;
}

const MAX_SCHEMA_ERRORS = 40;

export function validatePage(
  page: unknown,
  options: PageValidationOptions = {},
): ValidationReport {
  const startedAt = Date.now();
  const findings: ValidationFinding[] = [];
  const levelsRun: ValidationLevel[] = [];

  // ── Level 1: structural
  if (!options.skipStructural) {
    levelsRun.push('structural');
    const validate = validatorFor('page-definition.schema.json');
    if (!validate(page)) {
      for (const error of (validate.errors ?? []).slice(0, MAX_SCHEMA_ERRORS)) {
        findings.push({
          level: 'structural',
          severity: 'error',
          category: 'validation',
          path: error.instancePath || '/',
          code: `schema.${error.keyword}`,
          message: `${error.message ?? 'schema violation'}${
            error.keyword === 'additionalProperties'
              ? ` ("${String((error.params as { additionalProperty?: string }).additionalProperty)}")`
              : ''
          }`,
        });
      }
      // Structural failure makes the deeper levels meaningless — stop here.
      return summarize(findings, levelsRun, Date.now() - startedAt);
    }
  }

  const def = page as PageDefinition;
  const manifestByType = new Map(
    (options.manifests ?? []).map((m) => [m.type, m] as const),
  );

  // ── Level 2: component
  levelsRun.push('component');
  validateComponents(def, manifestByType, options.registeredTypes, findings);

  // ── Level 4: binding
  levelsRun.push('binding');
  validateBindings(def, manifestByType, findings);

  // ── Level 7: layout and local reference integrity
  levelsRun.push('layout');
  validateLayoutAndRefs(def, findings);

  // Expressions are compiled here so an invalid one is a design-time error with a
  // path, not a widget that silently degrades at render.
  validateExpressions(def, findings);

  validateActions(def, findings);

  return summarize(findings, levelsRun, Date.now() - startedAt);
}

// ── Level 2 ─────────────────────────────────────────────────────────────────

function validateComponents(
  def: PageDefinition,
  manifests: Map<string, ComponentManifest>,
  registeredTypes: readonly string[] | undefined,
  findings: ValidationFinding[],
): void {
  for (const [id, instance] of Object.entries(def.components)) {
    const path = `/components/${id}`;

    if (instance.id !== id) {
      findings.push({
        level: 'component',
        severity: 'error',
        category: 'validation',
        path: `${path}/id`,
        code: 'component.idMismatch',
        message: `Component id "${instance.id}" does not match its map key "${id}"`,
      });
    }

    if (registeredTypes && !registeredTypes.includes(instance.type)) {
      findings.push({
        level: 'component',
        severity: 'error',
        category: 'semantic',
        path: `${path}/type`,
        code: 'component.unknownType',
        message: `Component type "${instance.type}" is not in the registry`,
      });
      continue;
    }

    const manifest = manifests.get(instance.type);
    if (!manifest) continue;

    if (manifest.version !== instance.typeVersion) {
      const compatible = majorOf(manifest.version) === majorOf(instance.typeVersion);
      findings.push({
        level: 'component',
        severity: compatible ? 'warning' : 'error',
        category: 'semantic',
        path: `${path}/typeVersion`,
        code: compatible ? 'component.versionDrift' : 'component.incompatibleVersion',
        message: `Definition pins ${instance.type}@${instance.typeVersion}; registry has ${manifest.version}`,
      });
    }

    // The two-level check the schemas cannot express: instance config against the
    // manifest's own properties schema, resolved at the pinned registry version.
    if (instance.config) {
      try {
        const validateConfig = compileSubSchema(manifest.properties);
        if (!validateConfig(instance.config)) {
          for (const error of validateConfig.errors ?? []) {
            findings.push({
              level: 'component',
              severity: 'error',
              category: 'validation',
              path: `${path}/config${error.instancePath}`,
              code: `config.${error.keyword}`,
              message: `${instance.type}: ${error.message ?? 'invalid config'}${
                error.keyword === 'additionalProperties'
                  ? ` ("${String((error.params as { additionalProperty?: string }).additionalProperty)}")`
                  : ''
              }`,
            });
          }
        }
      } catch (error) {
        findings.push({
          level: 'component',
          severity: 'warning',
          category: 'validation',
          path: `${path}/config`,
          code: 'config.schemaUncompilable',
          message: `Could not compile the properties schema for ${instance.type}: ${String(error)}`,
        });
      }
    }

    // Accessibility labels the manifest declares as required for conformance.
    for (const label of manifest.accessibility.requiredLabels ?? []) {
      const present =
        (label === 'title' && instance.title) ||
        (instance.config && (instance.config as Record<string, unknown>)[label]);
      if (!present) {
        findings.push({
          level: 'component',
          severity: 'error',
          category: 'validation',
          path,
          code: 'component.missingRequiredLabel',
          message: `${instance.type} requires "${label}" for accessibility conformance`,
        });
      }
    }
  }
}

// ── Level 4 ─────────────────────────────────────────────────────────────────

function validateBindings(
  def: PageDefinition,
  manifests: Map<string, ComponentManifest>,
  findings: ValidationFinding[],
): void {
  const sources = def.dataSources ?? {};
  const aliasesBySource = new Map<string, Set<string>>(
    Object.entries(sources).map(([id, ds]) => [id, aliasesOf(ds)] as const),
  );

  for (const [id, instance] of Object.entries(def.components)) {
    const path = `/components/${id}`;
    const manifest = manifests.get(instance.type);
    const shape = manifest?.dataRequirement.shape;

    if (instance.dataSource && !aliasesBySource.has(instance.dataSource)) {
      findings.push({
        level: 'binding',
        severity: 'error',
        category: 'semantic',
        path: `${path}/dataSource`,
        code: 'binding.unknownDataSource',
        message: `Data source "${instance.dataSource}" is not declared on this page`,
      });
    }

    const declaredRoles = new Set((manifest?.dataRequirement.roles ?? []).map((r) => r.role));
    const boundRoles = new Set<string>();

    const checkBinding = (binding: FieldBinding, bindingPath: string) => {
      const sourceId = binding.source ?? instance.dataSource;
      if (!sourceId) {
        findings.push({
          level: 'binding',
          severity: 'error',
          category: 'validation',
          path: bindingPath,
          code: 'binding.noSource',
          message: 'Binding has no source and its component declares no default dataSource',
        });
        return;
      }
      const aliases = aliasesBySource.get(sourceId);
      if (!aliases) {
        findings.push({
          level: 'binding',
          severity: 'error',
          category: 'semantic',
          path: `${bindingPath}/source`,
          code: 'binding.unknownDataSource',
          message: `Data source "${sourceId}" is not declared on this page`,
        });
        return;
      }
      if (!aliases.has(binding.field)) {
        findings.push({
          level: 'binding',
          severity: 'error',
          category: 'semantic',
          path: `${bindingPath}/field`,
          code: 'binding.unknownField',
          message: `"${binding.field}" is not an alias of data source "${sourceId}". Available: ${[...aliases].join(', ') || '(none)'}`,
        });
      }
      if (binding.action && !(def.actions ?? {})[binding.action]) {
        findings.push({
          level: 'binding',
          severity: 'error',
          category: 'semantic',
          path: `${bindingPath}/action`,
          code: 'binding.unknownAction',
          message: `Action "${binding.action}" is not declared on this page`,
        });
      }
    };

    for (const [role, value] of Object.entries(instance.bindings ?? {})) {
      boundRoles.add(role);
      if (manifest && !declaredRoles.has(role)) {
        findings.push({
          level: 'binding',
          severity: 'error',
          category: 'semantic',
          path: `${path}/bindings/${role}`,
          code: 'binding.unknownRole',
          message: `${instance.type} declares no binding role "${role}". Available: ${[...declaredRoles].join(', ') || '(none)'}`,
        });
        continue;
      }
      const roleDef = manifest?.dataRequirement.roles?.find((r) => r.role === role);
      const list = Array.isArray(value) ? value : [value];
      if (roleDef && !roleDef.repeated && list.length > 1) {
        findings.push({
          level: 'binding',
          severity: 'error',
          category: 'validation',
          path: `${path}/bindings/${role}`,
          code: 'binding.notRepeatable',
          message: `Role "${role}" of ${instance.type} accepts a single binding`,
        });
      }
      list.forEach((binding, index) => {
        const suffix = Array.isArray(value) ? `/${index}` : '';
        checkBinding(binding, `${path}/bindings/${role}${suffix}`);
      });
    }

    for (const encoding of instance.encodings ?? []) {
      boundRoles.add(encoding.channel);
      checkBinding(encoding.binding, `${path}/encodings/${encoding.channel}/binding`);
    }

    for (const roleDef of manifest?.dataRequirement.roles ?? []) {
      if (roleDef.required && !boundRoles.has(roleDef.role)) {
        findings.push({
          level: 'binding',
          severity: 'error',
          category: 'validation',
          path: `${path}/bindings`,
          code: 'binding.missingRequiredRole',
          message: `${instance.type} requires a binding for role "${roleDef.role}"`,
        });
      }
    }

    if (shape === 'none' && instance.dataSource) {
      findings.push({
        level: 'binding',
        severity: 'warning',
        category: 'validation',
        path: `${path}/dataSource`,
        code: 'binding.unusedDataSource',
        message: `${instance.type} requires no data, but a data source is bound`,
      });
    }
  }
}

function aliasesOf(ds: DataSource): Set<string> {
  const aliases = new Set<string>();
  for (const a of ds.select.attributes ?? []) aliases.add(a.alias);
  for (const m of ds.select.measures ?? []) aliases.add(m.alias);
  for (const d of ds.select.dimensions ?? []) aliases.add(d.alias);
  return aliases;
}

// ── Level 7 ─────────────────────────────────────────────────────────────────

function validateLayoutAndRefs(def: PageDefinition, findings: ValidationFinding[]): void {
  const componentIds = new Set(Object.keys(def.components));
  const actionIds = new Set(Object.keys(def.actions ?? {}));
  const filterIds = new Set(Object.keys(def.filters ?? {}));
  const selectionIds = new Set(Object.keys(def.selections ?? {}));
  const paramIds = new Set(Object.keys(def.parameters ?? {}));
  const sourceIds = new Set(Object.keys(def.dataSources ?? {}));
  const referenced = new Set<string>();
  const seenNodeIds = new Set<string>();

  const walk = (node: LayoutNode, path: string): void => {
    if (seenNodeIds.has(node.id)) {
      findings.push({
        level: 'layout',
        severity: 'error',
        category: 'validation',
        path,
        code: 'layout.duplicateNodeId',
        message: `Layout node id "${node.id}" is used more than once`,
      });
    }
    seenNodeIds.add(node.id);

    if (node.kind === 'widget') {
      referenced.add(node.component);
      if (!componentIds.has(node.component)) {
        findings.push({
          level: 'layout',
          severity: 'error',
          category: 'semantic',
          path: `${path}/component`,
          code: 'layout.unknownComponent',
          message: `Widget "${node.id}" references component "${node.component}", which is not declared`,
        });
      }
      return;
    }

    if (node.kind === 'spacer') return;

    const container = node.container;
    switch (container.type) {
      case 'grid':
      case 'stack':
      case 'panel':
      case 'drawer':
        container.children.forEach((child, i) => walk(child, `${path}/children/${i}`));
        if (container.type === 'panel') {
          for (const actionId of container.headerActions ?? []) {
            if (!actionIds.has(actionId)) {
              findings.push({
                level: 'layout',
                severity: 'error',
                category: 'semantic',
                path: `${path}/headerActions`,
                code: 'layout.unknownAction',
                message: `Panel header action "${actionId}" is not declared`,
              });
            }
          }
        }
        break;
      case 'split':
        container.primary.forEach((c, i) => walk(c, `${path}/primary/${i}`));
        container.secondary.forEach((c, i) => walk(c, `${path}/secondary/${i}`));
        break;
      case 'tabs': {
        const source = container.source;
        if (container.selectedTabChannel && !filterIds.has(container.selectedTabChannel)) {
          findings.push({
            level: 'layout',
            severity: 'error',
            category: 'semantic',
            path: `${path}/selectedTabChannel`,
            code: 'layout.unknownFilterChannel',
            message: `Tab channel "${container.selectedTabChannel}" is not a declared filter channel`,
          });
        }
        if (source.mode === 'static') {
          source.tabs.forEach((tab, i) =>
            tab.content.forEach((c, j) => walk(c, `${path}/tabs/${i}/content/${j}`)),
          );
        } else {
          if (!sourceIds.has(source.source)) {
            findings.push({
              level: 'layout',
              severity: 'error',
              category: 'semantic',
              path: `${path}/source/source`,
              code: 'layout.unknownDataSource',
              message: `Data-driven tabs reference data source "${source.source}", which is not declared`,
            });
          }
          source.template.forEach((c, i) => walk(c, `${path}/source/template/${i}`));
          (source.pinnedTabs ?? []).forEach((tab, i) =>
            tab.content.forEach((c, j) => walk(c, `${path}/source/pinnedTabs/${i}/content/${j}`)),
          );
        }
        break;
      }
      case 'repeater':
        if (!sourceIds.has(container.source)) {
          findings.push({
            level: 'layout',
            severity: 'error',
            category: 'semantic',
            path: `${path}/source`,
            code: 'layout.unknownDataSource',
            message: `Repeater references data source "${container.source}", which is not declared`,
          });
        }
        container.template.forEach((c, i) => walk(c, `${path}/template/${i}`));
        break;
    }
  };

  walk(def.layout, '/layout');
  for (const [id, node] of Object.entries(def.overlays ?? {})) walk(node, `/overlays/${id}`);

  for (const id of componentIds) {
    if (!referenced.has(id)) {
      findings.push({
        level: 'layout',
        severity: 'warning',
        category: 'validation',
        path: `/components/${id}`,
        code: 'layout.orphanComponent',
        message: `Component "${id}" is declared but never placed in the layout`,
      });
    }
  }

  // writesTo channels must exist, since the renderer builds the invalidation graph from them.
  for (const [id, instance] of Object.entries(def.components)) {
    for (const channel of instance.writesTo?.filters ?? []) {
      if (!filterIds.has(channel)) {
        findings.push({
          level: 'layout',
          severity: 'error',
          category: 'semantic',
          path: `/components/${id}/writesTo/filters`,
          code: 'layout.unknownFilterChannel',
          message: `Component "${id}" writes to filter channel "${channel}", which is not declared`,
        });
      }
    }
    for (const channel of instance.writesTo?.selections ?? []) {
      if (!selectionIds.has(channel)) {
        findings.push({
          level: 'layout',
          severity: 'error',
          category: 'semantic',
          path: `/components/${id}/writesTo/selections`,
          code: 'layout.unknownSelectionChannel',
          message: `Component "${id}" writes to selection channel "${channel}", which is not declared`,
        });
      }
    }
    for (const [event, actionRef] of Object.entries(instance.eventActions ?? {})) {
      const list = Array.isArray(actionRef) ? actionRef : [actionRef];
      for (const actionId of list) {
        if (!actionIds.has(actionId)) {
          findings.push({
            level: 'layout',
            severity: 'error',
            category: 'semantic',
            path: `/components/${id}/eventActions/${event}`,
            code: 'layout.unknownAction',
            message: `Event "${event}" maps to action "${actionId}", which is not declared`,
          });
        }
      }
    }
  }

  // Computable value wrappers must reference declared page state.
  walkComputables(def, (ref, path) => {
    if (isParamRef(ref) && !paramIds.has(ref.$param)) {
      findings.push({
        level: 'layout',
        severity: 'error',
        category: 'semantic',
        path,
        code: 'reference.unknownParameter',
        message: `Reference to undeclared parameter "${ref.$param}"`,
      });
    }
    if (isFilterRef(ref) && !filterIds.has(ref.$filter)) {
      findings.push({
        level: 'layout',
        severity: 'error',
        category: 'semantic',
        path,
        code: 'reference.unknownFilterChannel',
        message: `Reference to undeclared filter channel "${ref.$filter}"`,
      });
    }
    if (isSelectionRef(ref) && !selectionIds.has(ref.$selection)) {
      findings.push({
        level: 'layout',
        severity: 'error',
        category: 'semantic',
        path,
        code: 'reference.unknownSelectionChannel',
        message: `Reference to undeclared selection channel "${ref.$selection}"`,
      });
    }
  });
}

// ── Expressions and actions ─────────────────────────────────────────────────

function validateExpressions(def: PageDefinition, findings: ValidationFinding[]): void {
  const sourceIds = new Set(Object.keys(def.dataSources ?? {}));
  const paramIds = new Set(Object.keys(def.parameters ?? {}));
  const filterIds = new Set(Object.keys(def.filters ?? {}));

  walkExpressions(def, (source, path) => {
    try {
      const ast = parseExpression(source);
      for (const ref of collectReferences(ast)) {
        if (ref.root === 'data' && ref.name && !sourceIds.has(ref.name)) {
          findings.push({
            level: 'layout',
            severity: 'error',
            category: 'semantic',
            path,
            code: 'expression.unknownDataSource',
            message: `Expression references data source "${ref.name}", which is not declared`,
          });
        }
        if (ref.root === 'params' && ref.name && !paramIds.has(ref.name)) {
          findings.push({
            level: 'layout',
            severity: 'error',
            category: 'semantic',
            path,
            code: 'expression.unknownParameter',
            message: `Expression references parameter "${ref.name}", which is not declared`,
          });
        }
        if (ref.root === 'filters' && ref.name && !filterIds.has(ref.name)) {
          findings.push({
            level: 'layout',
            severity: 'error',
            category: 'semantic',
            path,
            code: 'expression.unknownFilterChannel',
            message: `Expression references filter channel "${ref.name}", which is not declared`,
          });
        }
      }
    } catch (error) {
      findings.push({
        level: 'layout',
        severity: 'error',
        category: 'validation',
        path,
        code: 'expression.syntax',
        message:
          error instanceof ExpressionSyntaxError ? error.message : `Invalid expression: ${String(error)}`,
      });
    }
  });
}

function validateActions(def: PageDefinition, findings: ValidationFinding[]): void {
  const actionIds = new Set(Object.keys(def.actions ?? {}));
  const filterIds = new Set(Object.keys(def.filters ?? {}));
  const selectionIds = new Set(Object.keys(def.selections ?? {}));
  const paramIds = new Set(Object.keys(def.parameters ?? {}));
  const sourceIds = new Set(Object.keys(def.dataSources ?? {}));
  const overlayIds = new Set(Object.keys(def.overlays ?? {}));

  for (const [id, action] of Object.entries(def.actions ?? {}) as [string, Action][]) {
    const path = `/actions/${id}`;

    // The reserved seams are structurally valid and deliberately not executable.
    if ((RESERVED_ACTION_KINDS as readonly string[]).includes(action.kind)) {
      findings.push({
        level: 'component',
        severity: 'error',
        category: 'validation',
        path: `${path}/kind`,
        code: 'action.reservedKind',
        message: `Action kind "${action.kind}" is reserved for a later release and is rejected by the v1 runtime`,
      });
      continue;
    }

    switch (action.kind) {
      case 'setFilter':
        if (!filterIds.has(action.channel)) {
          findings.push(refError('action.unknownFilterChannel', `${path}/channel`, action.channel, 'filter channel'));
        }
        break;
      case 'clearFilters':
        for (const channel of action.channels ?? []) {
          if (!filterIds.has(channel)) {
            findings.push(refError('action.unknownFilterChannel', `${path}/channels`, channel, 'filter channel'));
          }
        }
        break;
      case 'setSelection':
        if (!selectionIds.has(action.channel)) {
          findings.push(
            refError('action.unknownSelectionChannel', `${path}/channel`, action.channel, 'selection channel'),
          );
        }
        break;
      case 'setParameter':
        if (!paramIds.has(action.parameter)) {
          findings.push(refError('action.unknownParameter', `${path}/parameter`, action.parameter, 'parameter'));
        }
        break;
      case 'refresh':
        for (const sourceId of action.dataSources ?? []) {
          if (!sourceIds.has(sourceId)) {
            findings.push(refError('action.unknownDataSource', `${path}/dataSources`, sourceId, 'data source'));
          }
        }
        break;
      case 'export':
        if (!sourceIds.has(action.dataSource)) {
          findings.push(refError('action.unknownDataSource', `${path}/dataSource`, action.dataSource, 'data source'));
        }
        if (def.security?.exportPolicy?.allowed === false) {
          findings.push({
            level: 'component',
            severity: 'error',
            category: 'validation',
            path,
            code: 'action.exportForbidden',
            message: 'Page export policy disallows export, but an export action is declared',
          });
        }
        break;
      case 'openOverlay':
        if (!overlayIds.has(action.overlay)) {
          findings.push(refError('action.unknownOverlay', `${path}/overlay`, action.overlay, 'overlay'));
        }
        break;
      case 'composite':
        for (const step of action.steps) {
          if (!actionIds.has(step)) {
            findings.push(refError('action.unknownStep', `${path}/steps`, step, 'action'));
          }
          if (step === id) {
            findings.push({
              level: 'component',
              severity: 'error',
              category: 'validation',
              path: `${path}/steps`,
              code: 'action.selfReference',
              message: `Composite action "${id}" includes itself`,
            });
          }
        }
        break;
      default:
        break;
    }
  }
}

function refError(
  code: string,
  path: string,
  value: string,
  what: string,
): ValidationFinding {
  return {
    level: 'component',
    severity: 'error',
    category: 'semantic',
    path,
    code,
    message: `Reference to undeclared ${what} "${value}"`,
  };
}

// ── Traversal helpers ───────────────────────────────────────────────────────

/** Visit every `{ $expr }` in the artifact, with a JSON Pointer to each. */
function walkExpressions(node: unknown, visit: (source: string, path: string) => void, path = ''): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkExpressions(item, visit, `${path}/${i}`));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  if (isExpression(node)) {
    visit(node.$expr, path);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    walkExpressions(value, visit, `${path}/${key}`);
  }
}

/** Visit every $param / $filter / $selection wrapper. */
function walkComputables(
  node: unknown,
  visit: (ref: object, path: string) => void,
  path = '',
): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkComputables(item, visit, `${path}/${i}`));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  if (isParamRef(node) || isFilterRef(node) || isSelectionRef(node)) {
    visit(node, path);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    walkComputables(value, visit, `${path}/${key}`);
  }
}

function majorOf(version: string): string {
  return version.split('.')[0] ?? '0';
}

export type { ValidationFinding, ValidationLevel, ValidationReport };
