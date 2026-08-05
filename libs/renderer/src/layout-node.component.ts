/**
 * Layout interpreter: walks the CompiledPage's layout tree and renders containers.
 *
 * Placement resolves per breakpoint from the definition, so responsive behaviour is
 * a stored property of the artifact rather than a CSS accident
 * (architecture/frontend-architecture.md §5.3). Container queries handle
 * component-internal layout; this component handles arrangement.
 *
 * M1 implements grid, stack, panel and static tabs. Split, drawer, data-driven tabs
 * and repeater are compiled but render a stated placeholder — see
 * docs/M1-IMPLEMENTATION.md §6.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
} from '@angular/core';
import { resolvePlacement } from '@opus/platform';
import { text, type Identifier } from '@opus/contracts';

import type { CompiledNode, CompiledPage, CompiledTab } from './compile-page';
import { PageContextService } from './page-context.service';
import { QueryOrchestratorService } from './query-orchestrator.service';
import { ActionDispatcherService } from './action-dispatcher.service';
import { WidgetHostComponent } from './widget-host.component';

@Component({
  selector: 'opus-layout-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The recursive template — a container renders its children through the same
  // interpreter — needs the component in its own imports. forwardRef is required:
  // a direct self-reference is evaluated while the class binding is still
  // uninitialised, so it resolves to undefined and the component silently fails to
  // register (NG2012 at every other site that imports it).
  // The recursive template — a container renders its children through the same
  // interpreter — needs the component in its own imports. forwardRef is required:
  // a direct self-reference is evaluated while the class binding is still
  // uninitialised, so it resolves to undefined and every other importer fails.
  imports: [WidgetHostComponent, forwardRef(() => LayoutNodeComponent)],
  template: `
    @if (visible()) {
      @switch (node().kind) {
        @case ('widget') {
          <opus-widget-host [componentId]="widgetComponentId()" [page]="page()" />
        }

        @case ('spacer') {
          <div class="spacer" aria-hidden="true"></div>
        }

        @case ('container') {
          @switch (containerType()) {
            @case ('grid') {
              <div class="grid" [attr.data-gap]="gap()">
                @for (child of children(); track child.id) {
                  <div class="cell" [style]="cellStyle(child)">
                    <opus-layout-node [node]="child" [page]="page()" />
                  </div>
                }
              </div>
            }

            @case ('stack') {
              <!--
                A row stack is laid out on the same 12-column grid as the grid
                container. colSpan means "columns of twelve", and flex-basis
                percentages cannot honour that once gaps are added: four 25% items
                plus three gaps overflow and wrap to one per line. A column stack
                stays flex.
              -->
              @if (stackDirection() === 'row') {
                <div class="grid" [attr.data-gap]="gap()">
                  @for (child of children(); track child.id) {
                    <div class="cell" [style]="cellStyle(child)">
                      <opus-layout-node [node]="child" [page]="page()" />
                    </div>
                  }
                </div>
              } @else {
                <div class="stack" data-direction="column" [attr.data-gap]="gap()">
                  @for (child of children(); track child.id) {
                    <div class="stack-item">
                      <opus-layout-node [node]="child" [page]="page()" />
                    </div>
                  }
                </div>
              }
            }

            @case ('panel') {
              <section class="panel" [attr.data-variant]="panelVariant()">
                @if (panelTitle()) {
                  <header class="panel-header">
                    <div>
                      <h3>{{ panelTitle() }}</h3>
                      @if (panelSubtitle()) {
                        <p class="panel-subtitle">{{ panelSubtitle() }}</p>
                      }
                    </div>
                    @if (headerActions().length) {
                      <div class="panel-actions">
                        @for (action of headerActions(); track action.id) {
                          <button
                            type="button"
                            class="panel-action"
                            [attr.data-emphasis]="action.emphasis"
                            (click)="dispatch(action.id)"
                          >
                            @if (action.icon) {
                              <span aria-hidden="true">{{ action.icon === 'refresh' ? '↻' : '↓' }}</span>
                            }
                            {{ action.label }}
                          </button>
                        }
                      </div>
                    }
                  </header>
                }
                <div class="panel-body">
                  @for (child of children(); track child.id) {
                    <opus-layout-node [node]="child" [page]="page()" />
                  }
                </div>
              </section>
            }

            @case ('tabs') {
              <div class="tabs">
                <div class="tablist" role="tablist" [attr.aria-label]="node().id">
                  @for (tab of visibleTabs(); track tab.id) {
                    <button
                      type="button"
                      role="tab"
                      class="tab"
                      [id]="tabButtonId(tab)"
                      [attr.aria-selected]="tab.id === activeTabId()"
                      [attr.aria-controls]="tabPanelId(tab)"
                      [attr.tabindex]="tab.id === activeTabId() ? 0 : -1"
                      (click)="selectTab(tab.id)"
                      (keydown)="onTabKeydown($event)"
                    >
                      {{ tab.label }}
                      @if (tabBadge(tab)) {
                        <span class="tab-badge">{{ tabBadge(tab) }}</span>
                      }
                    </button>
                  }
                </div>
                @for (tab of visibleTabs(); track tab.id) {
                  @if (tab.id === activeTabId()) {
                    <div
                      role="tabpanel"
                      class="tabpanel"
                      [id]="tabPanelId(tab)"
                      [attr.aria-labelledby]="tabButtonId(tab)"
                      tabindex="0"
                    >
                      @for (child of tab.content; track child.id) {
                        <opus-layout-node [node]="child" [page]="page()" />
                      }
                    </div>
                  }
                }
              </div>
            }

            @default {
              <!-- Compiled but not yet rendered: states plainly rather than
                   rendering nothing, so an unimplemented container is visible. -->
              <div class="unimplemented" role="status">
                Container type "{{ containerType() }}" is compiled but not rendered by the M1
                runtime.
              </div>
            }
          }
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
      min-inline-size: 0;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(var(--opus-grid-columns), minmax(0, 1fr));
      gap: var(--opus-gap-md);
      align-items: stretch;
    }

    .grid[data-gap='none'] {
      gap: 0;
    }
    .grid[data-gap='sm'] {
      gap: var(--opus-gap-sm);
    }
    .grid[data-gap='lg'] {
      gap: var(--opus-gap-lg);
    }

    .cell {
      min-inline-size: 0;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: var(--opus-gap-md);
      align-items: stretch;
      min-inline-size: 0;
    }

    .stack[data-gap='sm'] {
      gap: var(--opus-gap-sm);
    }
    .stack[data-gap='lg'] {
      gap: var(--opus-gap-lg);
    }

    .stack-item {
      flex-grow: 1;
      min-inline-size: 0;
    }

    .spacer {
      min-block-size: var(--opus-space-4);
    }

    .panel {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      background: var(--opus-surface);
      border-radius: var(--opus-radius-md);
    }

    .panel[data-variant='bordered'] {
      border: 1px solid var(--opus-border);
    }

    .panel[data-variant='raised'] {
      box-shadow: var(--opus-shadow-raised);
    }

    .panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--opus-space-3);
      padding: var(--opus-space-3) var(--opus-space-4);
      border-block-end: 1px solid var(--opus-border);
    }

    .panel-header h3 {
      margin: 0;
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .panel-subtitle {
      margin: 2px 0 0;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .panel-actions {
      display: flex;
      gap: var(--opus-space-2);
      flex-shrink: 0;
    }

    .panel-action {
      display: inline-flex;
      align-items: center;
      gap: var(--opus-space-1);
      padding: var(--opus-space-1) var(--opus-space-3);
      font: inherit;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      cursor: pointer;
    }

    .panel-action:hover {
      color: var(--opus-text);
      background: var(--opus-surface-hover);
      border-color: var(--opus-border-strong);
    }

    .panel-action:focus-visible,
    .tab:focus-visible,
    .tabpanel:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 2px;
    }

    .panel-body {
      display: flex;
      flex-direction: column;
      gap: var(--opus-gap-md);
      flex: 1;
      padding: var(--opus-space-4);
      min-inline-size: 0;
    }

    .tabs {
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-3);
    }

    .tablist {
      display: flex;
      gap: var(--opus-space-1);
      overflow-x: auto;
      border-block-end: 1px solid var(--opus-border);
    }

    .tab {
      display: inline-flex;
      align-items: center;
      gap: var(--opus-space-2);
      padding: var(--opus-space-2) var(--opus-space-3);
      font: inherit;
      font-size: var(--opus-text-sm);
      white-space: nowrap;
      color: var(--opus-text-secondary);
      background: none;
      border: 0;
      border-block-end: 2px solid transparent;
      cursor: pointer;
    }

    .tab[aria-selected='true'] {
      color: var(--opus-text);
      font-weight: var(--opus-weight-medium);
      border-block-end-color: var(--opus-emphasis-info);
    }

    .tab-badge {
      padding: 0 var(--opus-space-1);
      font-size: var(--opus-text-xs);
      color: var(--opus-emphasis-negative);
      background: var(--opus-emphasis-negative-bg);
      border-radius: var(--opus-radius-sm);
    }

    .tabpanel {
      display: flex;
      flex-direction: column;
      gap: var(--opus-gap-md);
    }

    .unimplemented {
      padding: var(--opus-space-4);
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
      background: var(--opus-surface-sunken);
      border: 1px dashed var(--opus-border-strong);
      border-radius: var(--opus-radius-md);
    }
  `,
})
export class LayoutNodeComponent {
  readonly node = input.required<CompiledNode>();
  readonly page = input.required<CompiledPage>();

  private readonly context = inject(PageContextService);
  private readonly orchestrator = inject(QueryOrchestratorService);
  private readonly dispatcher = inject(ActionDispatcherService);

  protected readonly visible = computed(() => {
    const node = this.node();
    if (node.kind === 'spacer') return true;
    if (!node.visible) return this.placementVisible();
    return node.visible.test(this.context.scope()) && this.placementVisible();
  });

  private placementVisible(): boolean {
    const node = this.node();
    if (node.kind === 'spacer') return true;
    return !resolvePlacement(node.placement, this.context.breakpoint()).hidden;
  }

  protected readonly widgetComponentId = computed<Identifier>(() => {
    const node = this.node();
    return node.kind === 'widget' ? node.componentId : '';
  });

  private readonly container = computed(() => {
    const node = this.node();
    return node.kind === 'container' ? node.container : null;
  });

  protected readonly containerType = computed(() => this.container()?.spec.type ?? 'grid');
  protected readonly children = computed(() => this.container()?.children ?? []);

  protected readonly gap = computed(() => {
    const spec = this.container()?.spec;
    return spec && 'gap' in spec ? (spec.gap ?? 'md') : 'md';
  });

  protected readonly stackDirection = computed(() => {
    const spec = this.container()?.spec;
    if (!spec || spec.type !== 'stack') return 'row';
    const override = spec.directionByBreakpoint?.[this.context.breakpoint()];
    return override ?? spec.direction ?? 'row';
  });

  protected readonly panelVariant = computed(() => {
    const spec = this.container()?.spec;
    return spec && spec.type === 'panel' ? (spec.variant ?? 'bordered') : 'bordered';
  });

  protected readonly panelTitle = computed(() => {
    const spec = this.container()?.spec;
    return spec && spec.type === 'panel' ? text(spec.title) : '';
  });

  protected readonly panelSubtitle = computed(() => {
    const spec = this.container()?.spec;
    return spec && spec.type === 'panel' ? text(spec.subtitle) : '';
  });

  protected readonly headerActions = computed(() => {
    const spec = this.container()?.spec;
    if (!spec || spec.type !== 'panel') return [];
    const actions = this.page().definition.actions ?? {};
    const held = this.context.user()?.capabilities ?? [];
    return (spec.headerActions ?? [])
      .map((id) => actions[id])
      .filter((a): a is NonNullable<typeof a> => a !== undefined)
      .filter((a) => !a.visible || this.context.test(a.visible.$expr))
      // Same capability check the page header applies. Hiding an affordance the
      // user cannot use is a usability measure; the server still decides.
      .filter((a) => (a.security?.requiredCapabilities ?? []).every((c) => held.includes(c)))
      .map((a) => ({
        id: a.id,
        label: text(a.label) || a.id,
        icon: a.icon,
        emphasis: a.emphasis ?? 'secondary',
      }));
  });

  // ── tabs ──────────────────────────────────────────────────────────────────

  protected readonly visibleTabs = computed<readonly CompiledTab[]>(() => {
    const tabs = this.container()?.tabs ?? [];
    const scope = this.context.scope();
    return tabs.filter((tab) => !tab.visible || tab.visible.test(scope));
  });

  protected readonly activeTabId = computed(() => {
    const tabs = this.visibleTabs();
    if (!tabs.length) return '';
    const spec = this.container()?.spec;
    const channel = spec && spec.type === 'tabs' ? spec.selectedTabChannel : undefined;

    // A declared channel makes the active tab page state — deep-linkable and
    // readable by expressions elsewhere on the page.
    const fromChannel = channel ? this.context.filters()[channel] : undefined;
    const fromLocal = this.context.activeTab(this.node().id);
    const candidate = String(fromChannel ?? fromLocal ?? '');
    return tabs.some((t) => t.id === candidate) ? candidate : tabs[0]!.id;
  });

  protected selectTab(tabId: string): void {
    const spec = this.container()?.spec;
    const channel = spec && spec.type === 'tabs' ? spec.selectedTabChannel : undefined;
    if (channel) this.context.setFilter(channel, tabId);
    this.context.setActiveTab(this.node().id, tabId);

    // Activating a tab activates its deferred sources — this is why a page with
    // eight tabs does not issue eight queries to show one.
    const tab = this.visibleTabs().find((t) => t.id === tabId);
    if (tab) {
      const sources = new Set<Identifier>();
      const collect = (node: CompiledNode) => {
        if (node.kind === 'widget') {
          for (const s of this.page().widgetSources[node.componentId] ?? []) sources.add(s);
          return;
        }
        if (node.kind === 'spacer') return;
        const c = node.container;
        [
          ...c.children,
          ...(c.primary ?? []),
          ...(c.secondary ?? []),
          ...(c.template ?? []),
          ...(c.tabs ?? []).flatMap((t) => t.content),
        ].forEach(collect);
      };
      tab.content.forEach(collect);
      void this.orchestrator.activateSources([...sources]);
    }
  }

  /** Roving tabindex with arrow-key navigation, per the WAI-ARIA tabs pattern. */
  protected onTabKeydown(event: KeyboardEvent): void {
    const tabs = this.visibleTabs();
    const currentIndex = tabs.findIndex((t) => t.id === this.activeTabId());
    let nextIndex: number | null = null;

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const next = tabs[nextIndex];
    if (next) {
      this.selectTab(next.id);
      const root = event.currentTarget as HTMLElement;
      const list = root.parentElement;
      const button = list?.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex];
      button?.focus();
    }
  }

  protected tabBadge(tab: CompiledTab): string {
    if (tab.badge === undefined) return '';
    const value = this.context.resolveComputable(tab.badge);
    if (value === null || value === undefined || value === 0) return '';
    return String(value);
  }

  protected tabButtonId(tab: CompiledTab): string {
    return `tab-${this.node().id}-${tab.deepLinkId}`;
  }

  protected tabPanelId(tab: CompiledTab): string {
    return `tabpanel-${this.node().id}-${tab.deepLinkId}`;
  }

  // ── placement ─────────────────────────────────────────────────────────────

  protected cellStyle(child: CompiledNode): Record<string, string> {
    if (child.kind === 'spacer' && !child.placement) return {};
    const resolved = resolvePlacement(
      'placement' in child ? child.placement : undefined,
      this.context.breakpoint(),
    );
    const style: Record<string, string> = {
      'grid-column': resolved.colStart
        ? `${resolved.colStart} / span ${resolved.colSpan}`
        : `span ${resolved.colSpan}`,
    };
    if (resolved.rowSpan > 1) style['grid-row'] = `span ${resolved.rowSpan}`;
    if (resolved.order !== undefined) style['order'] = String(resolved.order);
    if (resolved.minHeight) style['min-block-size'] = resolved.minHeight;
    return style;
  }

  protected dispatch(actionId: Identifier): void {
    void this.dispatcher.dispatch(actionId);
  }
}
