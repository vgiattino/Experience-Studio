/**
 * The Page aspect: everything about the page that is not a widget.
 *
 * Name and description are editable here because they are the two properties an author changes most
 * and the only two the inspector could already reach — the rest is a **read-out**, and that is a
 * deliberate stopping point rather than an unfinished one.
 *
 * WHY MOST OF THIS IS READ-ONLY. Parameters, filter channels, selections, security, presentation and
 * performance are each governed by their own slice of the page schema, with conditions, computable
 * defaults and entitlement expressions in them. A form that let an author edit a `Condition` by typing
 * into a text box would produce artifacts the validator rejects and give them no way to see why; a
 * form that did it properly is a schema-driven editor per aspect, which is a milestone, not a panel.
 * What the author needs *today* is to know these declarations exist and what they say — because until
 * this tab, a page's URL contract, its entitlement requirements and its cache policy were invisible
 * unless you read the JSON.
 *
 * So: every field is shown, nothing is hidden because it is not editable, and the panel says plainly
 * which parts are read-only and where to change them.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { text, type I18nString } from '@opus/contracts';
import { DefinitionStore, setPageProperty } from '@opus/studio-core';

/** A flattened declaration row: what the kv-tables render. */
interface DeclarationRow {
  id: string;
  label: string;
  detail: string;
  tags: readonly string[];
}

@Component({
  selector: 'opus-page-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="opus-aspect">
      @if (!definition()) {
        <p class="opus-aspect-empty">No page is open.</p>
      } @else {
        <p class="opus-section-label">Identity</p>
        <div class="opus-props-grid">
          <label class="opus-field">
            <span class="opus-field-label">Name</span>
            <input
              class="opus-input"
              [value]="name()"
              (change)="setName($any($event.target).value)"
              placeholder="What this page is called"
            />
            <span class="opus-field-help">Shown in the page list, the library card and the runtime.</span>
          </label>
          <label class="opus-field">
            <span class="opus-field-label">Page id</span>
            <input class="opus-input" [value]="pageId()" disabled />
            <span class="opus-field-help">
              Immutable. It is the artifact's identity and appears in every URL that links here.
            </span>
          </label>
        </div>
        <label class="opus-field">
          <span class="opus-field-label">Description</span>
          <textarea
            class="opus-textarea"
            [value]="description()"
            (change)="setDescription($any($event.target).value)"
            placeholder="One or two sentences about what this page answers"
          ></textarea>
          <span class="opus-field-help">
            Read by the library card, and by a generation call as context for this page.
          </span>
        </label>

        <div class="opus-props-grid">
          <div class="opus-field">
            <span class="opus-field-label">Kind</span>
            <p class="value">{{ kind() }}</p>
          </div>
          <div class="opus-field">
            <span class="opus-field-label">Version</span>
            <p class="value">
              v{{ version().artifactVersion }} · {{ version().lifecycleState }}
              @if (version().immutable) {
                · immutable
              }
            </p>
          </div>
          <div class="opus-field">
            <span class="opus-field-label">Pins</span>
            <p class="value">
              catalog {{ version().pins?.catalogVersion ?? '—' }} · registry
              {{ version().pins?.registryVersion ?? '—' }}
            </p>
          </div>
        </div>

        @if (tags().length) {
          <div class="opus-field">
            <span class="opus-field-label">Tags</span>
            <p class="value">{{ tags().join(', ') }}</p>
          </div>
        }

        <!--
          Parameters are the page's URL contract. A page whose parameters an author cannot see is a page
          whose deep links they cannot construct — and every drill-down into this page passes one.
        -->
        <p class="opus-section-label">Parameters — the page's URL contract</p>
        @if (parameters().length) {
          <dl class="opus-kv-table">
            <div class="opus-kv-head"><span>Parameter</span><span>Declaration</span></div>
            @for (row of parameters(); track row.id) {
              <div class="opus-kv-row">
                <dt>
                  <span class="mono">{{ row.id }}</span>
                  @if (row.label) {
                    <span class="muted"> — {{ row.label }}</span>
                  }
                </dt>
                <dd>
                  {{ row.detail }}
                  @for (tag of row.tags; track tag) {
                    <span class="opus-tag">{{ tag }}</span>
                  }
                </dd>
              </div>
            }
          </dl>
        } @else {
          <p class="none">None. This page takes no parameters, so it cannot be deep-linked to a record.</p>
        }

        <p class="opus-section-label">Filter channels — page state widgets read and write</p>
        @if (filters().length) {
          <dl class="opus-kv-table">
            <div class="opus-kv-head"><span>Channel</span><span>Declaration</span></div>
            @for (row of filters(); track row.id) {
              <div class="opus-kv-row">
                <dt>
                  <span class="mono">{{ row.id }}</span>
                  @if (row.label) {
                    <span class="muted"> — {{ row.label }}</span>
                  }
                </dt>
                <dd>
                  {{ row.detail }}
                  @for (tag of row.tags; track tag) {
                    <span class="opus-tag">{{ tag }}</span>
                  }
                </dd>
              </div>
            }
          </dl>
        } @else {
          <p class="none">None. Nothing on this page filters anything else.</p>
        }

        @if (selections().length) {
          <p class="opus-section-label">Selection channels</p>
          <dl class="opus-kv-table">
            @for (row of selections(); track row.id) {
              <div class="opus-kv-row">
                <dt><span class="mono">{{ row.id }}</span></dt>
                <dd>{{ row.detail }}</dd>
              </div>
            }
          </dl>
        }

        <p class="opus-section-label">Governance and delivery</p>
        <dl class="opus-kv-table">
          <div class="opus-kv-row">
            <dt>Required capabilities</dt>
            <dd>{{ security().capabilities || 'none declared' }}</dd>
          </div>
          <div class="opus-kv-row">
            <dt>Data capabilities</dt>
            <dd>{{ security().dataCapabilities || 'none declared' }}</dd>
          </div>
          <div class="opus-kv-row">
            <dt>On denial</dt>
            <dd>{{ security().onDenied }}</dd>
          </div>
          <div class="opus-kv-row">
            <dt>Density / theme</dt>
            <dd>{{ presentation() }}</dd>
          </div>
          <div class="opus-kv-row">
            <dt>Performance budget</dt>
            <dd>{{ performance() }}</dd>
          </div>
          <div class="opus-kv-row">
            <dt>Navigation</dt>
            <dd>{{ navigation() }}</dd>
          </div>
        </dl>

        <p class="footnote">
          Everything below Identity is read-only here. Each of these is governed by its own slice of the
          page schema — conditions, computable defaults, entitlement expressions — and editing them
          safely needs a form built against that schema rather than a text box. Until then the JSON tab
          is the place to change them, and the validator will tell you if a change is wrong.
        </p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .opus-field {
      max-inline-size: 46rem;
    }

    .value {
      margin: 0;
      font-size: var(--opus-text-md);
      color: var(--opus-text);
    }

    .opus-kv-row {
      grid-template-columns: minmax(0, 14rem) minmax(0, 1fr);
    }

    .mono {
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-sm);
    }

    .muted {
      color: var(--opus-text-muted);
    }

    dd .opus-tag {
      margin-inline-start: var(--opus-space-1);
    }

    .none {
      margin: 0;
      font-size: var(--opus-text-md);
      color: var(--opus-text-muted);
    }

    .footnote {
      margin: var(--opus-space-5) 0 0;
      max-inline-size: 52rem;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    @media (max-width: 700px) {
      .opus-kv-row {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class PagePanelComponent {
  private readonly store = inject(DefinitionStore);

  protected readonly definition = this.store.definition;

  protected readonly name = computed(() => text(this.definition()?.name) || '');
  protected readonly description = computed(() => text(this.definition()?.description) || '');
  protected readonly pageId = computed(() => this.definition()?.id ?? '');
  protected readonly kind = computed(() => this.definition()?.kind ?? '—');
  protected readonly tags = computed(() => [...(this.definition()?.tags ?? [])]);
  /**
   * The version envelope, with a fallback of the SAME SHAPE.
   *
   * A narrower fallback made `pins` unreadable off the union, and the template needs it: the catalog
   * and registry a page is pinned to are what make "it rendered last week" a checkable claim.
   */
  protected readonly version = computed(() => {
    const version = this.definition()?.version;
    return {
      artifactVersion: version?.artifactVersion ?? 0,
      lifecycleState: version?.lifecycleState ?? 'draft',
      immutable: version?.immutable ?? false,
      pins: version?.pins ?? null,
    };
  });

  protected readonly parameters = computed<readonly DeclarationRow[]>(() =>
    Object.entries(this.definition()?.parameters ?? {}).map(([id, parameter]) => ({
      id,
      label: text(parameter.label as I18nString | undefined) || '',
      detail: [
        parameter.dataType,
        parameter.multiValued ? 'multi-valued' : null,
        parameter.default !== undefined ? `default ${JSON.stringify(parameter.default)}` : null,
        parameter.boundToAttribute ? `bound to ${parameter.boundToAttribute}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      tags: [
        parameter.required ? 'required' : 'optional',
        // The property that decides whether a deep link works, so it is a tag rather than prose.
        parameter.syncToUrl === false ? 'not in URL' : 'in URL',
        ...(parameter.scope ? [String(parameter.scope)] : []),
      ],
    })),
  );

  protected readonly filters = computed<readonly DeclarationRow[]>(() =>
    Object.entries(this.definition()?.filters ?? {}).map(([id, channel]) => ({
      id,
      label: text(channel.label as I18nString | undefined) || '',
      detail: [
        channel.dataType,
        channel.multiValued ? 'multi-valued' : null,
        channel.default !== undefined ? `default ${JSON.stringify(channel.default)}` : null,
        channel.boundToAttribute ? `bound to ${channel.boundToAttribute}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      tags: [
        channel.syncToUrl ? 'in URL' : 'not in URL',
        ...(channel.persist && channel.persist !== 'none' ? [`persists per ${channel.persist}`] : []),
        ...(channel.clearable === false ? ['not clearable'] : []),
      ],
    })),
  );

  protected readonly selections = computed<readonly DeclarationRow[]>(() =>
    Object.entries(this.definition()?.selections ?? {}).map(([id, channel]) => {
      const record = channel as Record<string, unknown>;
      return {
        id,
        label: '',
        detail: [
          record['mode'] ? `mode ${String(record['mode'])}` : null,
          record['entity'] ? `over ${String(record['entity'])}` : null,
          record['maxItems'] ? `max ${String(record['maxItems'])}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'declared',
        tags: [],
      };
    }),
  );

  protected readonly security = computed(() => {
    const security = (this.definition()?.security ?? {}) as {
      requiredCapabilities?: readonly string[];
      requiredDataCapabilities?: readonly string[];
      onDenied?: string;
    };
    return {
      capabilities: (security.requiredCapabilities ?? []).join(', '),
      dataCapabilities: (security.requiredDataCapabilities ?? []).join(', '),
      // The default is the safe one, and naming it is the point: an author who sees "hide" knows the
      // page vanishes rather than explaining itself.
      onDenied: security.onDenied ?? 'not declared (the runtime hides the page)',
    };
  });

  protected readonly presentation = computed(() => {
    const presentation = (this.definition()?.presentation ?? {}) as Record<string, unknown>;
    const parts = Object.entries(presentation).map(([key, value]) => `${key} ${String(value)}`);
    return parts.length ? parts.join(' · ') : 'platform defaults';
  });

  protected readonly performance = computed(() => {
    const performance = (this.definition()?.performance ?? {}) as Record<string, unknown>;
    const parts = Object.entries(performance).map(([key, value]) =>
      typeof value === 'object' && value !== null
        ? `${key} ${JSON.stringify(value)}`
        : `${key} ${String(value)}`,
    );
    return parts.length ? parts.join(' · ') : 'platform defaults';
  });

  protected readonly navigation = computed(() => {
    const navigation = this.definition()?.navigation;
    if (!navigation) return 'not declared';
    return (
      [
        navigation.breadcrumbs?.mode ? `breadcrumbs ${navigation.breadcrumbs.mode}` : null,
        navigation.backBehaviour ? `back ${navigation.backBehaviour}` : null,
        navigation.pageActions?.length ? `${navigation.pageActions.length} page action(s)` : null,
        navigation.relatedLinks?.length ? `${navigation.relatedLinks.length} related link(s)` : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'declared, with defaults'
    );
  });

  protected setName(value: string): void {
    if (value === this.name()) return;
    this.store.run((definition) => setPageProperty(definition, 'name', value));
  }

  protected setDescription(value: string): void {
    if (value === this.description()) return;
    this.store.run((definition) => setPageProperty(definition, 'description', value));
  }
}
