/**
 * Action execution.
 *
 * Components emit events; the page maps events to actions; this dispatcher
 * executes them. Keeping behaviour declarative is what makes interaction
 * generatable by the AI and analysable by the renderer — interaction expressed in
 * component code would be permanently outside both
 * (schemas/action.schema.json, architecture/runtime-architecture.md §9).
 *
 * The reserved kinds (`invoke`, `workflow`) are rejected here as well as by the
 * validator, so a definition that slipped past validation still cannot mutate.
 */

import { Injectable, inject } from '@angular/core';
import { TelemetryService } from '@opus/platform';
import {
  RESERVED_ACTION_KINDS,
  type Action,
  type CompositeAction,
  type DrilldownAction,
  type ExperienceNavigation,
  type Identifier,
  type NavigateAction,
  type PageDefinition,
  type ParamMap,
} from '@opus/contracts';

import { PageContextService } from './page-context.service';
import { QueryOrchestratorService } from './query-orchestrator.service';

export interface NavigationRequest {
  experienceId?: string;
  pageId: Identifier;
  tabId?: Identifier;
  params: Record<string, unknown>;
  openIn: 'self' | 'newTab' | 'drawer' | 'modal';
}

export interface DispatcherHost {
  /** Handles navigate and drilldown. Supplied by the shell. */
  navigate: (request: NavigationRequest) => void;
  /** Handles export. M1 downloads CSV client-side; production exports server-side. */
  exportData?: (sourceId: Identifier, format: string, reason?: string) => void;
  /** Confirmation prompt. Returns the reason string, or null if cancelled. */
  confirm?: (message: string, requiresReason: boolean) => Promise<string | null>;
}

@Injectable()
export class ActionDispatcherService {
  private readonly context = inject(PageContextService);
  private readonly orchestrator = inject(QueryOrchestratorService);
  private readonly telemetry = inject(TelemetryService);

  private definition: PageDefinition | null = null;
  private host: DispatcherHost | null = null;
  private experienceNavigation: ExperienceNavigation | null = null;

  attach(
    definition: PageDefinition,
    host: DispatcherHost,
    experienceNavigation?: ExperienceNavigation,
  ): void {
    this.definition = definition;
    this.host = host;
    this.experienceNavigation = experienceNavigation ?? null;
  }

  /** Resolve an event from a component instance to its mapped actions and run them. */
  async handleEvent(
    componentId: Identifier,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const definition = this.definition;
    if (!definition) return;
    const instance = definition.components[componentId];
    const mapped = instance?.eventActions?.[event];
    if (!mapped) return;
    const ids = Array.isArray(mapped) ? mapped : [mapped];
    for (const id of ids) await this.dispatch(id, payload);
  }

  async dispatch(actionId: Identifier, payload: Record<string, unknown> = {}): Promise<void> {
    const action = this.definition?.actions?.[actionId];
    if (!action) {
      this.telemetry.recordProblem({
        scope: 'action',
        code: 'unknownAction',
        detail: `Action "${actionId}" is not declared on this page`,
      });
      return;
    }

    if ((RESERVED_ACTION_KINDS as readonly string[]).includes(action.kind)) {
      this.telemetry.recordProblem({
        scope: 'action',
        code: 'reservedKind',
        detail: `Action "${actionId}" is of reserved kind "${action.kind}" and is not executable in v1`,
      });
      return;
    }

    if (action.enabled && !this.context.test(action.enabled.$expr, { event: payload })) return;

    // Confirmation is required for anything with an outward effect.
    let reason: string | undefined;
    if (action.confirm && this.host?.confirm) {
      const message =
        typeof action.confirm.message === 'string'
          ? action.confirm.message
          : action.confirm.message.default;
      const result = await this.host.confirm(message, action.confirm.requiresReason ?? false);
      if (result === null) return;
      reason = result;
    }

    await this.execute(action, payload, reason);

    if (action.auditProfile === 'elevated') {
      // In production this is a server-side audit record. Recording it in telemetry
      // here keeps the seam visible rather than implying it does not exist.
      this.telemetry.recordProblem({
        scope: 'audit',
        code: 'elevatedAction',
        detail: `${action.kind} action "${action.id}" executed${reason ? ` (reason: ${reason})` : ''}`,
      });
    }
  }

  private async execute(
    action: Action,
    payload: Record<string, unknown>,
    reason: string | undefined,
  ): Promise<void> {
    switch (action.kind) {
      case 'setFilter': {
        const value = this.resolve(action.value, payload);
        const current = this.context.filters()[action.channel];
        this.context.setFilter(action.channel, applyMode(current, value, action.mode ?? 'replace'));
        await this.orchestrator.applyChange();
        return;
      }

      case 'clearFilters':
        this.context.clearFilters(action.channels);
        await this.orchestrator.applyChange();
        return;

      case 'setParameter':
        this.context.setParam(action.parameter, this.resolve(action.value, payload));
        await this.orchestrator.applyChange();
        return;

      case 'setSelection': {
        const value = action.mode === 'clear' ? null : this.resolve(action.value, payload);
        const current = this.context.selections()[action.channel];
        this.context.setSelection(
          action.channel,
          action.mode === 'clear' ? null : applyMode(current, value, action.mode ?? 'replace'),
        );
        await this.orchestrator.applyChange();
        return;
      }

      case 'refresh':
        await this.orchestrator.refresh(action.dataSources, action.bypassCache !== false);
        return;

      case 'navigate':
        this.host?.navigate(this.navigationFor(action, payload));
        return;

      case 'drilldown':
        this.host?.navigate(this.drilldownFor(action, payload));
        return;

      case 'openUrl': {
        const url = this.resolveUrl(action.urlTemplate, action.params, payload);
        if (!isSafeUrl(url)) {
          this.telemetry.recordProblem({
            scope: 'action',
            code: 'unsafeUrl',
            detail: `Refused to open "${url}" — only http(s) URLs are permitted`,
          });
          return;
        }
        window.open(url, action.target === 'self' ? '_self' : '_blank', 'noopener,noreferrer');
        return;
      }

      case 'export':
        this.host?.exportData?.(action.dataSource, action.format, reason);
        return;

      case 'openOverlay':
        // Overlays are visibility-driven via `openWhen`; M1 has no overlay in the
        // sample page, so this records rather than silently doing nothing.
        this.telemetry.recordProblem({
          scope: 'action',
          code: 'overlayNotImplemented',
          detail: `openOverlay("${action.overlay}") is not implemented in M1`,
        });
        return;

      case 'composite': {
        const composite = action as CompositeAction;
        for (const step of composite.steps) {
          try {
            await this.dispatch(step, payload);
          } catch (error) {
            if (composite.onError !== 'continue') throw error;
          }
        }
        return;
      }

      default:
        this.telemetry.recordProblem({
          scope: 'action',
          code: 'unsupportedKind',
          detail: `Action kind "${(action as Action).kind}" is not supported by the M1 runtime`,
        });
    }
  }

  private navigationFor(action: NavigateAction, payload: Record<string, unknown>): NavigationRequest {
    return {
      experienceId: action.target.experience,
      pageId: action.target.page,
      tabId: action.target.tab,
      params: {
        ...(action.carryContext !== false ? this.carriedParams() : {}),
        ...this.resolveMap(action.params, payload),
      },
      openIn: action.openIn ?? 'self',
    };
  }

  /**
   * Generic drill-down: the target resolves from the experience's drilldownTargets,
   * so a page can express "drill into this security" without knowing the page graph
   * — and every page drills to the same place.
   */
  private drilldownFor(action: DrilldownAction, payload: Record<string, unknown>): NavigationRequest {
    const override = action.targetOverride;
    const registered = this.experienceNavigation?.drilldownTargets?.[action.entity];
    const target: { page: string; tab?: string; openIn?: string } | undefined =
      override ?? registered;

    if (!target) {
      this.telemetry.recordProblem({
        scope: 'action',
        code: 'unresolvedDrilldownTarget',
        detail: `No drill-down target is registered for entity "${action.entity}"`,
      });
    }

    return {
      pageId: target?.page ?? '',
      tabId: target?.tab,
      params: {
        ...(action.carryContext !== false ? this.carriedParams() : {}),
        ...this.resolveMap(action.key, payload),
        ...this.resolveMap(action.additionalParams, payload),
      },
      openIn: action.openIn ?? (target?.openIn as NavigationRequest['openIn']) ?? 'self',
    };
  }

  /** Experience-scoped parameters survive a hop, so an as-of date is not silently reset. */
  private carriedParams(): Record<string, unknown> {
    const definition = this.definition;
    if (!definition) return {};
    const out: Record<string, unknown> = {};
    for (const [id, spec] of Object.entries(definition.parameters ?? {})) {
      if (spec.scope === 'experience' || spec.scope === 'session') {
        out[id] = this.context.params()[id];
      }
    }
    return out;
  }

  private resolve(value: unknown, payload: Record<string, unknown>): unknown {
    return this.context.resolveComputable(value as never, { event: payload });
  }

  private resolveMap(map: ParamMap | undefined, payload: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(map ?? {})) {
      out[key] = this.resolve(value, payload);
    }
    return out;
  }

  /**
   * URL templates only interpolate declared parameters. A definition cannot
   * assemble an arbitrary URL from row data, which would make it an exfiltration
   * endpoint (schemas/action.schema.json, openUrlAction).
   */
  private resolveUrl(
    template: string,
    params: ParamMap | undefined,
    payload: Record<string, unknown>,
  ): string {
    const resolved = this.resolveMap(params, payload);
    return template.replace(/\{([A-Za-z][A-Za-z0-9-]*)\}/g, (match, name: string) =>
      name in resolved ? encodeURIComponent(String(resolved[name] ?? '')) : match,
    );
  }
}

function applyMode(current: unknown, value: unknown, mode: string): unknown {
  const list = Array.isArray(current) ? [...current] : current === null || current === undefined ? [] : [current];
  switch (mode) {
    case 'add':
      return dedupe([...list, value]);
    case 'remove':
      return list.filter((v) => String(v) !== String(value));
    case 'toggle':
      return list.some((v) => String(v) === String(value))
        ? list.filter((v) => String(v) !== String(value))
        : dedupe([...list, value]);
    case 'replace':
    default:
      return value;
  }
}

function dedupe(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = String(v);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
