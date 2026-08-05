/**
 * The JSON page loader (architecture/runtime-architecture.md §3–§5).
 *
 * Stages, in order, exactly as the runtime architecture specifies:
 *   resolve → validate → migrate → compile
 *
 * Validation is client-side here because M1 has no server. In production, level-1
 * validation of a *published* definition is a server concern and the Viewer trusts
 * what the Definition Service returns; the validator is loaded lazily so ajv and the
 * schema set stay in a separate chunk either way.
 */

import { Injectable, inject, signal } from '@angular/core';
import { TelemetryService } from '@opus/platform';
import { loadAllManifests, registeredTypes, REGISTRY_VERSION } from '@opus/component-registry';
import { isPageRef, type ExperienceDefinition, type PageDefinition } from '@opus/contracts';
import type { ValidationReport } from '@opus/validator';

import { compilePage, type CompiledPage } from './compile-page';
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations';

export type LoadOutcome =
  | { ok: true; page: CompiledPage; report?: ValidationReport; cacheHit: boolean }
  | { ok: false; stage: 'fetch' | 'validate' | 'migrate' | 'compile'; detail: string; report?: ValidationReport };

@Injectable({ providedIn: 'root' })
export class PageLoaderService {
  private readonly telemetry = inject(TelemetryService);

  readonly lastReport = signal<ValidationReport | null>(null);

  async loadExperience(url: string): Promise<ExperienceDefinition | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as ExperienceDefinition;
    } catch (error) {
      this.telemetry.recordProblem({
        scope: 'loader',
        code: 'experienceFetchFailed',
        detail: `${url}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return null;
    }
  }

  /**
   * Resolve a page from an experience, following a `$pageRef` when the page is
   * stored separately.
   */
  async loadPage(
    experience: ExperienceDefinition,
    pageId: string,
    baseUrl: string,
    options: { validate?: boolean } = {},
  ): Promise<LoadOutcome> {
    const entry = experience.pages[pageId];
    if (!entry) {
      return { ok: false, stage: 'fetch', detail: `Experience declares no page "${pageId}"` };
    }

    let raw: unknown = entry;
    if (isPageRef(entry)) {
      try {
        const response = await fetch(`${baseUrl}/${entry.$pageRef}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        raw = await response.json();
      } catch (error) {
        return {
          ok: false,
          stage: 'fetch',
          detail: `Could not load "${entry.$pageRef}": ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    return this.processDefinition(raw, options);
  }

  async loadPageFromUrl(url: string, options: { validate?: boolean } = {}): Promise<LoadOutcome> {
    let raw: unknown;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      raw = await response.json();
    } catch (error) {
      return {
        ok: false,
        stage: 'fetch',
        detail: `${url}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    return this.processDefinition(raw, options);
  }

  /**
   * Load a definition already in memory — an AI generation, or a Studio draft.
   *
   * Deliberately the SAME path as a fetched definition: migrate → validate → compile, with
   * the same validator and the same telemetry. A generated page that renders here but would
   * be rejected on reload would be the worst kind of bug, and routing generation through a
   * shortcut is how that bug gets written.
   */
  async loadDefinition(
    definition: unknown,
    options: { validate?: boolean } = {},
  ): Promise<LoadOutcome> {
    return this.processDefinition(definition, options);
  }

  private async processDefinition(
    raw: unknown,
    options: { validate?: boolean },
  ): Promise<LoadOutcome> {
    if (raw === null || typeof raw !== 'object') {
      return { ok: false, stage: 'fetch', detail: 'Definition is not a JSON object' };
    }

    // ── migrate (before validation, so an older definition is validated in its
    //    migrated shape rather than rejected for conforming to an older schema)
    const outcome = migrate(raw as Record<string, unknown>);
    if (!outcome.ok) {
      this.telemetry.recordProblem({ scope: 'loader', code: outcome.reason, detail: outcome.detail });
      return { ok: false, stage: 'migrate', detail: outcome.detail };
    }
    if (outcome.chain.length) {
      this.telemetry.recordProblem({
        scope: 'loader',
        code: 'migrated',
        detail: `Applied in-memory migrations: ${outcome.chain.join(', ')} (stored definition unchanged)`,
      });
    }

    const definition = outcome.definition as unknown as PageDefinition;

    // ── validate
    let report: ValidationReport | undefined;
    if (options.validate !== false) {
      try {
        const [{ validatePage }, manifests] = await Promise.all([
          import('@opus/validator'),
          loadAllManifests(),
        ]);
        report = validatePage(definition, {
          manifests,
          registeredTypes: registeredTypes(),
        });
        this.lastReport.set(report);

        for (const finding of report.findings) {
          this.telemetry.recordProblem({
            scope: `validate/${finding.level}`,
            code: finding.code,
            detail: `${finding.path} — ${finding.message}`,
          });
        }

        if (!report.valid) {
          return {
            ok: false,
            stage: 'validate',
            detail: `${report.findings.filter((f) => f.severity === 'error').length} validation error(s)`,
            report,
          };
        }
      } catch (error) {
        // A validator failure must not stop a page rendering: report it and continue,
        // because in production the definition was already validated server-side.
        this.telemetry.recordProblem({
          scope: 'loader',
          code: 'validatorUnavailable',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // The definition pins a registry version. A mismatch is worth stating, because
    // it is the condition under which an unknown component type can appear.
    if (definition.version.pins.registryVersion !== REGISTRY_VERSION) {
      this.telemetry.recordProblem({
        scope: 'loader',
        code: 'registryVersionSkew',
        detail: `Definition pins registry ${definition.version.pins.registryVersion}; runtime has ${REGISTRY_VERSION}`,
      });
    }

    // ── compile
    try {
      const { page, cacheHit } = compilePage(definition);
      this.telemetry.recordRender({
        pageId: definition.id,
        definitionVersion: definition.version.artifactVersion,
        compileMs: Math.round(page.compileMs * 100) / 100,
        compileCacheHit: cacheHit,
        widgetCount: Object.keys(definition.components).length,
      });
      return { ok: true, page, report, cacheHit };
    } catch (error) {
      return {
        ok: false,
        stage: 'compile',
        detail: error instanceof Error ? error.message : String(error),
        report,
      };
    }
  }

  readonly schemaVersion = CURRENT_SCHEMA_VERSION;
  readonly registryVersion = REGISTRY_VERSION;
}
