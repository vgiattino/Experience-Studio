/**
 * The inspector.
 *
 * Four sections, and which section appears depends on what is selected — a container has no
 * properties schema, a widget has no gap. All of it is generated: the properties from the
 * manifest's JSON Schema, the data bindings from the manifest's declared roles crossed with the
 * data source's aliases, and the entity/measure pickers from the catalog projection.
 *
 * PLACEMENT IS EDITED PER BREAKPOINT, MOBILE-FIRST, and the panel says so. The cascade
 * direction is the thing authors get wrong — it was got wrong in the M1 definitions by their
 * own author — so the editor states the rule where the decision is made rather than leaving it
 * in a schema description nobody reads.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  BREAKPOINT_ORDER,
  text,
  type Breakpoint,
  type Container,
  type DataSource,
  type FieldBinding,
} from '@opus/contracts';

import type { CatalogSnapshot } from '@opus/catalog';

import { EditorService } from './editor.service';
import {
  coerceFieldValue,
  humanize,
  orderedFieldsForManifest,
  type PropertyField,
} from './property-schema';

type PlacementKey = 'colSpan' | 'colStart' | 'rowSpan' | 'order' | 'minHeight';

const CONTAINER_TYPES: readonly Container['type'][] = ['grid', 'stack', 'panel', 'split'];
const GAPS = ['none', 'sm', 'md', 'lg'] as const;

@Component({
  selector: 'opus-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!node()) {
      <div class="empty">
        <p>Nothing selected.</p>
        <p class="muted">Pick a widget on the canvas or a row in the outline.</p>
      </div>
    } @else {
      <div class="inspector">
        <header>
          <p class="kind">{{ node()!.node.kind }}</p>
          <h2>{{ heading() }}</h2>
          <p class="id">{{ node()!.node.id }}</p>
          <div class="actions">
            <button type="button" (click)="editor.duplicate(node()!.node.id)">Duplicate</button>
            <button type="button" (click)="editor.wrap(node()!.node.id, 'panel')">Wrap in panel</button>
            <button type="button" class="danger" (click)="editor.remove(node()!.node.id)">Delete</button>
          </div>
        </header>

        <!-- ── widget: identity and generated properties ─────────────────────────── -->
        @if (component(); as instance) {
          <section>
            <h3>Content</h3>
            <label>
              <span>Title</span>
              <input
                type="text"
                [value]="asText(instance.title)"
                (change)="setComponentField('title', $any($event.target).value)"
              />
            </label>
            <label>
              <span>Subtitle</span>
              <input
                type="text"
                [value]="asText(instance.subtitle)"
                (change)="setComponentField('subtitle', $any($event.target).value)"
              />
            </label>
            <label>
              <span>Description</span>
              <input
                type="text"
                [value]="asText(instance.description)"
                (change)="setComponentField('description', $any($event.target).value)"
              />
            </label>
          </section>

          <section>
            <h3>
              Properties
              <span class="from">from {{ instance.type }}&#64;{{ instance.typeVersion }}</span>
            </h3>
            @if (!fields().length) {
              <p class="muted">This component declares no configurable properties.</p>
            }
            @for (field of fields(); track field.key) {
              <label [class.checkbox]="field.kind === 'boolean'">
                <span>{{ field.label }}@if (field.required) {<em>*</em>}</span>

                @switch (field.kind) {
                  @case ('boolean') {
                    <input
                      type="checkbox"
                      [checked]="configValue(field) === true"
                      (change)="setConfig(field, $any($event.target).checked)"
                    />
                  }
                  @case ('select') {
                    <select (change)="setConfig(field, $any($event.target).value)">
                      <option value="" [selected]="configValue(field) === undefined">—</option>
                      @for (option of field.options; track option.value) {
                        <option [value]="option.value" [selected]="configValue(field) === option.value">
                          {{ option.label }}
                        </option>
                      }
                    </select>
                  }
                  @case ('number') {
                    <input
                      type="number"
                      [value]="configValue(field) ?? ''"
                      [attr.min]="field.min"
                      [attr.max]="field.max"
                      (change)="setConfig(field, $any($event.target).value)"
                    />
                  }
                  @case ('textarea') {
                    <textarea
                      rows="3"
                      [value]="configValue(field) ?? ''"
                      (change)="setConfig(field, $any($event.target).value)"
                    ></textarea>
                  }
                  @case ('json') {
                    <textarea
                      rows="3"
                      class="mono"
                      [value]="jsonValue(field)"
                      (change)="setConfig(field, $any($event.target).value)"
                    ></textarea>
                  }
                  @default {
                    <input
                      type="text"
                      [value]="configValue(field) ?? ''"
                      [attr.maxlength]="field.maxLength"
                      (change)="setConfig(field, $any($event.target).value)"
                    />
                  }
                }

                @if (field.description) {
                  <small>{{ field.description }}</small>
                }
              </label>
            }
          </section>

          <!-- ── data ──────────────────────────────────────────────────────────── -->
          <section>
            <h3>Data</h3>
            @if (dataShape() === 'none') {
              <p class="muted">This component takes no data.</p>
            } @else {
              <label>
                <span>Data source</span>
                <select (change)="onDataSourceChange($any($event.target).value)">
                  <option value="" [selected]="!instance.dataSource">— none —</option>
                  @for (source of dataSources(); track source.id) {
                    <option [value]="source.id" [selected]="source.id === instance.dataSource">
                      {{ source.id }} ({{ source.entity }})
                    </option>
                  }
                  <option value="__new">＋ New from catalog…</option>
                </select>
                <small>
                  A data source is a declarative query over a catalog entity — the same shape a
                  hand-authored or generated page uses.
                </small>
              </label>

              @if (creatingSource()) {
                <div class="subform">
                  <label>
                    <span>Business entity</span>
                    <select (change)="newSourceEntity.set($any($event.target).value)">
                      <option value="">— choose —</option>
                      @for (entity of entities(); track entity.id) {
                        <option [value]="entity.id" [selected]="entity.id === newSourceEntity()">
                          {{ entity.name }}
                        </option>
                      }
                    </select>
                  </label>

                  @if (wantsMeasure()) {
                    <label>
                      <span>Measure</span>
                      <select (change)="newSourceMeasure.set($any($event.target).value)">
                        <option value="">— choose —</option>
                        @for (measure of measures(); track measure.id) {
                          <option [value]="measure.id" [selected]="measure.id === newSourceMeasure()">
                            {{ measure.name }} ({{ measure.defaultAggregation }})
                          </option>
                        }
                      </select>
                      <small>A business measure, not a column. The gateway resolves the column.</small>
                    </label>
                  }

                  <div class="row">
                    <button
                      type="button"
                      class="primary"
                      [disabled]="!canCreateSource()"
                      (click)="createSource()"
                    >
                      Add data source
                    </button>
                    <button type="button" (click)="creatingSource.set(false)">Cancel</button>
                  </div>
                </div>
              }

              @if (instance.dataSource && roles().length) {
                @for (role of roles(); track role.role) {
                  <label>
                    <span>{{ humanize(role.role) }}@if (role.required) {<em>*</em>}</span>
                    <select (change)="editor.bindRole(instance.id, role.role, $any($event.target).value)">
                      <option value="">— unbound —</option>
                      @for (alias of aliases(); track alias) {
                        <option [value]="alias" [selected]="alias === boundField(role.role)">
                          {{ alias }}
                        </option>
                      }
                    </select>
                    @if (role.repeated && isRepeated(role.role)) {
                      <small>
                        This role holds several fields — edit the list in the JSON view.
                      </small>
                    }
                  </label>
                }
              }
            }
          </section>
        }

        <!-- ── container ─────────────────────────────────────────────────────────── -->
        @if (container(); as spec) {
          <section>
            <h3>Layout</h3>
            <label>
              <span>Container</span>
              <select (change)="editor.changeContainerType(node()!.node.id, $any($event.target).value)">
                @for (type of containerTypes; track type) {
                  <option [value]="type" [selected]="type === spec.type">{{ humanize(type) }}</option>
                }
                @if (!containerTypes.includes(spec.type)) {
                  <option [value]="spec.type" selected>{{ spec.type }}</option>
                }
              </select>
            </label>

            @if (spec.type === 'grid' || spec.type === 'stack' || spec.type === 'panel' || spec.type === 'drawer') {
              <label>
                <span>Gap</span>
                <select (change)="setContainerOption('gap', $any($event.target).value)">
                  @for (gap of gaps; track gap) {
                    <option [value]="gap" [selected]="gap === containerValue('gap')">{{ gap }}</option>
                  }
                </select>
              </label>
            }

            @if (spec.type === 'stack') {
              <label>
                <span>Direction</span>
                <select (change)="setContainerOption('direction', $any($event.target).value)">
                  <option value="row" [selected]="containerValue('direction') === 'row'">Row</option>
                  <option value="column" [selected]="containerValue('direction') === 'column'">
                    Column
                  </option>
                </select>
                <small>A row stack lays out on the same 12-column grid, so colSpan applies.</small>
              </label>
              <label class="checkbox">
                <span>Wrap</span>
                <input
                  type="checkbox"
                  [checked]="containerValue('wrap') === true"
                  (change)="setContainerOption('wrap', $any($event.target).checked)"
                />
              </label>
            }

            @if (spec.type === 'panel') {
              <label>
                <span>Panel title</span>
                <input
                  type="text"
                  [value]="asText(containerValue('title'))"
                  (change)="setContainerOption('title', $any($event.target).value)"
                />
              </label>
              <label>
                <span>Variant</span>
                <select (change)="setContainerOption('variant', $any($event.target).value)">
                  @for (variant of ['plain', 'bordered', 'raised']; track variant) {
                    <option [value]="variant" [selected]="variant === containerValue('variant')">
                      {{ variant }}
                    </option>
                  }
                </select>
              </label>
            }

            @if (spec.type === 'split') {
              <label>
                <span>Orientation</span>
                <select (change)="setContainerOption('orientation', $any($event.target).value)">
                  <option value="horizontal" [selected]="containerValue('orientation') === 'horizontal'">
                    Horizontal
                  </option>
                  <option value="vertical" [selected]="containerValue('orientation') === 'vertical'">
                    Vertical
                  </option>
                </select>
              </label>
            }
          </section>
        }

        <!-- ── placement ─────────────────────────────────────────────────────────── -->
        @if (node()!.node.kind !== 'container' || node()!.parentId !== undefined) {
          <section>
            <h3>Placement</h3>
            <p class="muted">
              Mobile-first: the base value is the narrowest case, and a breakpoint override
              applies at that width <em>and wider</em>.
            </p>

            <div class="placement-grid">
              <span class="head">Width</span>
              <span class="head">Cols /12</span>
              <span class="head">Hide</span>

              <span class="bp">base</span>
              <input
                type="number"
                min="1"
                max="12"
                [value]="placementValue('colSpan') ?? ''"
                (change)="setPlacement('colSpan', $any($event.target).value)"
              />
              <span class="na">—</span>

              @for (bp of breakpoints; track bp) {
                <span class="bp">{{ bp }}</span>
                <input
                  type="number"
                  min="1"
                  max="12"
                  placeholder="inherit"
                  [value]="placementValue('colSpan', bp) ?? ''"
                  (change)="setPlacement('colSpan', $any($event.target).value, bp)"
                />
                <input
                  type="checkbox"
                  [checked]="placementValue('hidden', bp) === true"
                  (change)="setPlacement('hidden', $any($event.target).checked, bp)"
                />
              }
            </div>

            <label>
              <span>Minimum height</span>
              <input
                type="text"
                placeholder="e.g. 320px"
                [value]="placementValue('minHeight') ?? ''"
                (change)="setPlacement('minHeight', $any($event.target).value)"
              />
            </label>
          </section>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      overflow-y: auto;
      font-size: var(--opus-text-sm);
    }

    .empty {
      padding: var(--opus-space-4);
    }

    .empty p {
      margin: 0 0 4px;
    }

    .inspector {
      display: flex;
      flex-direction: column;
    }

    header {
      padding: var(--opus-space-3);
      border-block-end: 1px solid var(--opus-border);
    }

    .kind {
      margin: 0;
      font-size: var(--opus-text-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--opus-text-muted);
    }

    h2 {
      margin: 2px 0 0;
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-semibold);
    }

    .id {
      margin: 2px 0 0;
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .actions {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-block-start: var(--opus-space-2);
    }

    .actions button,
    .row button {
      font: inherit;
      font-size: var(--opus-text-xs);
      padding: 3px var(--opus-space-2);
      color: var(--opus-text-secondary);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      cursor: pointer;
    }

    .actions .danger {
      color: var(--opus-emphasis-negative);
    }

    .row button.primary {
      color: var(--opus-text-inverse);
      background: var(--opus-accent);
      border-color: var(--opus-accent);
    }

    .row button.primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    section {
      padding: var(--opus-space-3);
      border-block-end: 1px solid var(--opus-border);
    }

    h3 {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--opus-space-2);
      margin: 0 0 var(--opus-space-2);
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--opus-text-muted);
    }

    .from {
      font-family: var(--opus-font-mono);
      font-size: 0.65rem;
      text-transform: none;
      letter-spacing: 0;
      opacity: 0.8;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-block-end: var(--opus-space-2);
    }

    label > span {
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
    }

    label > span em {
      color: var(--opus-emphasis-negative);
      font-style: normal;
    }

    /* A checkbox belongs beside its label, but its description belongs underneath — a three-item
       flex row squeezes the label into two words and the help text into a column. */
    label.checkbox {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 2px var(--opus-space-2);
    }

    label.checkbox > small {
      grid-column: 1 / -1;
    }

    input,
    select,
    textarea {
      font: inherit;
      font-size: var(--opus-text-sm);
      padding: 3px var(--opus-space-1);
      color: var(--opus-text);
      background: var(--opus-canvas);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      min-inline-size: 0;
    }

    input[type='checkbox'] {
      inline-size: auto;
      justify-self: start;
    }

    textarea.mono {
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
    }

    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 1px;
    }

    small,
    .muted {
      font-size: var(--opus-text-xs);
      line-height: 1.4;
      color: var(--opus-text-muted);
    }

    .muted {
      margin: 0 0 var(--opus-space-2);
    }

    .subform {
      padding: var(--opus-space-2);
      margin-block-end: var(--opus-space-2);
      background: var(--opus-canvas);
      border: 1px dashed var(--opus-border);
      border-radius: var(--opus-radius-sm);
    }

    .row {
      display: flex;
      gap: var(--opus-space-2);
    }

    .placement-grid {
      display: grid;
      grid-template-columns: 3rem minmax(0, 1fr) 2.2rem;
      gap: 4px var(--opus-space-2);
      align-items: center;
      margin-block-end: var(--opus-space-2);
    }

    .placement-grid .head {
      font-size: 0.6rem;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--opus-text-muted);
    }

    .placement-grid .bp {
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
    }

    .placement-grid .na {
      color: var(--opus-text-muted);
      text-align: center;
    }
  `,
})
export class InspectorComponent {
  protected readonly editor = inject(EditorService);
  protected readonly containerTypes = CONTAINER_TYPES;
  protected readonly gaps = GAPS;
  protected readonly breakpoints = BREAKPOINT_ORDER;
  protected readonly humanize = humanize;

  protected readonly node = this.editor.selectedNode;
  protected readonly component = this.editor.selectedComponent;
  protected readonly manifest = this.editor.selectedManifest;

  /** Local UI state. A half-filled form is not an edit, so it stays out of the patch log. */
  protected readonly creatingSource = signal(false);
  protected readonly newSourceEntity = signal('');
  protected readonly newSourceMeasure = signal('');

  protected readonly container = computed(() => {
    const located = this.node();
    return located?.node.kind === 'container' ? located.node.container : undefined;
  });

  protected readonly heading = computed(() => {
    const instance = this.component();
    if (instance) return this.asText(instance.title) || instance.type;
    const spec = this.container();
    if (spec) return humanize(spec.type);
    return humanize(this.node()?.node.kind ?? '');
  });

  protected readonly fields = computed(() => {
    const manifest = this.manifest();
    return manifest ? orderedFieldsForManifest(manifest) : [];
  });

  protected readonly dataSources = computed<readonly DataSource[]>(() =>
    Object.values(this.editor.store.definition()?.dataSources ?? {}),
  );

  protected readonly roles = computed(() => this.manifest()?.dataRequirement.roles ?? []);

  /** Undefined until the manifest has loaded, so the template must not assume a shape. */
  protected readonly dataShape = computed(() => this.manifest()?.dataRequirement.shape);

  /** The aliases the attached source actually produces — the only fields a binding may name. */
  protected readonly aliases = computed<string[]>(() => {
    const instance = this.component();
    const source = instance?.dataSource
      ? this.editor.store.definition()?.dataSources?.[instance.dataSource]
      : undefined;
    if (!source) return [];
    return [
      ...(source.select.measures ?? []).map((m) => m.alias),
      ...(source.select.dimensions ?? []).map((d) => d.alias),
      ...(source.select.attributes ?? []).map((a) => a.alias),
    ].filter(Boolean);
  });

  protected readonly entities = computed(() => {
    const snapshot = this.editor.catalog();
    if (!snapshot) return [];
    return Object.values(snapshot.entities).map((entity) => ({
      id: entity.id,
      name: text(entity.pluralName ?? entity.businessName),
    }));
  });

  protected readonly measures = computed(() => {
    const snapshot = this.editor.catalog();
    const entity = snapshot?.entities[this.newSourceEntity()];
    if (!entity) return [];
    return Object.values(entity.measures).map((measure) => ({
      id: measure.id,
      name: text(measure.businessName),
      defaultAggregation: measure.defaultAggregation,
    }));
  });

  /** A scalar or series component needs a measure; a tabular one needs columns. */
  protected readonly wantsMeasure = computed(() => {
    const shape = this.dataShape();
    return shape === 'scalar' || shape === 'series';
  });

  protected readonly canCreateSource = computed(
    () => Boolean(this.newSourceEntity()) && (!this.wantsMeasure() || Boolean(this.newSourceMeasure())),
  );

  protected asText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'default' in value) {
      return String((value as { default?: unknown }).default ?? '');
    }
    return '';
  }

  protected configValue(field: PropertyField): unknown {
    return this.component()?.config?.[field.key];
  }

  protected jsonValue(field: PropertyField): string {
    const value = this.configValue(field);
    return value === undefined ? '' : JSON.stringify(value, null, 2);
  }

  protected setConfig(field: PropertyField, raw: string | boolean): void {
    const instance = this.component();
    if (!instance) return;
    const value = coerceFieldValue(field, raw);
    this.editor.setConfig(instance.id, field.key, field.kind === 'boolean' ? Boolean(raw) : value);
  }

  protected setComponentField(key: string, value: string): void {
    const instance = this.component();
    if (instance) this.editor.setComponentField(instance.id, key, value);
  }

  protected containerValue(key: string): unknown {
    return (this.container() as Record<string, unknown> | undefined)?.[key];
  }

  protected setContainerOption(key: string, value: unknown): void {
    const located = this.node();
    if (located) this.editor.setContainerOption(located.node.id, key, value);
  }

  protected placementValue(key: PlacementKey | 'hidden', breakpoint?: Breakpoint): unknown {
    const placement = (this.node()?.node as { placement?: Record<string, unknown> } | undefined)
      ?.placement;
    if (!placement) return undefined;
    if (!breakpoint) return placement[key];
    const overrides = placement['breakpoints'] as Record<string, Record<string, unknown>> | undefined;
    return overrides?.[breakpoint]?.[key];
  }

  protected setPlacement(
    key: PlacementKey | 'hidden',
    raw: string | boolean,
    breakpoint?: Breakpoint,
  ): void {
    const located = this.node();
    if (!located) return;
    if (key === 'hidden') {
      // `hidden: false` is the default, so storing it adds noise to the definition. Clearing it
      // is the same statement in fewer bytes.
      this.editor.setPlacement(located.node.id, key, raw === true ? true : undefined, breakpoint);
      return;
    }
    if (key === 'minHeight') {
      this.editor.setPlacement(located.node.id, key, String(raw), breakpoint);
      return;
    }
    const value = raw === '' ? undefined : Number(raw);
    this.editor.setPlacement(
      located.node.id,
      key,
      value !== undefined && Number.isFinite(value) ? value : undefined,
      breakpoint,
    );
  }

  protected boundField(role: string): string | undefined {
    const binding = this.component()?.bindings?.[role];
    if (!binding || Array.isArray(binding)) return undefined;
    return (binding as FieldBinding).field;
  }

  protected isRepeated(role: string): boolean {
    return Array.isArray(this.component()?.bindings?.[role]);
  }

  protected onDataSourceChange(value: string): void {
    const instance = this.component();
    if (!instance) return;
    if (value === '__new') {
      this.creatingSource.set(true);
      return;
    }
    this.creatingSource.set(false);
    this.editor.setDataSource(instance.id, value || undefined);
  }

  protected createSource(): void {
    const instance = this.component();
    if (!instance || !this.canCreateSource()) return;
    const snapshot = this.editor.catalog();
    const entity = snapshot?.entities[this.newSourceEntity()];
    if (!entity) return;

    if (this.wantsMeasure()) {
      const measure = entity.measures[this.newSourceMeasure()];
      if (!measure) return;
      this.editor.addDataSource({
        entity: entity.id,
        kind: 'aggregate',
        measure: { ref: measure.id, aggregation: measure.defaultAggregation },
        componentId: instance.id,
        mandatoryFilter: mandatoryFilterFor(entity),
      });
    } else {
      // A table's columns: the label attribute first, then enough others to be useful. The
      // author refines from there, which is faster than picking every column from empty.
      const attributes = Object.values(entity.attributes)
        .filter((attribute) => !attribute.deprecated)
        .slice(0, 6)
        .map((attribute) => ({ ref: attribute.id, label: text(attribute.businessName) }));
      this.editor.addDataSource({
        entity: entity.id,
        kind: 'list',
        attributes,
        componentId: instance.id,
        mandatoryFilter: mandatoryFilterFor(entity),
      });
    }

    this.creatingSource.set(false);
    this.newSourceEntity.set('');
    this.newSourceMeasure.set('');
  }
}

/**
 * A filter for an entity the catalog marks `requiresFilter`.
 *
 * Prefer a date, because an operational page almost always means "as of a date" anyway; fall back
 * to an enum over its full value set, which bounds the scan without hiding rows the author
 * expected to see. An entity offering neither gets nothing, and level 3 then says so in the status
 * bar — which is better than the builder inventing a predicate the author did not ask for.
 */
function mandatoryFilterFor(
  entity: CatalogSnapshot['entities'][string],
): { attribute: string; operator: string; value?: unknown } | undefined {
  if (entity.cost?.requiresFilter !== true) return undefined;

  const temporal = Object.values(entity.attributes).find(
    (attribute) =>
      attribute.filterable !== false &&
      (attribute.dataType === 'date' || attribute.dataType === 'datetime'),
  );
  if (temporal) return { attribute: temporal.id, operator: 'onOrAfterToday' };

  const enumerated = Object.values(entity.attributes).find(
    (attribute) => attribute.filterable !== false && (attribute.enumValues?.length ?? 0) > 0,
  );
  if (enumerated?.enumValues) {
    return {
      attribute: enumerated.id,
      operator: 'in',
      value: enumerated.enumValues.map((value) => value.value),
    };
  }
  return undefined;
}
