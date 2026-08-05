/**
 * Resolving and compiling a page of an experience.
 *
 * The service exists to keep one rule true: **a definition is compiled once and rendered many
 * times.** Compilation resolves component types, compiles expressions into pure functions, builds the
 * dependency graph and partitions eager from deferred work — none of which depends on the view, all
 * of which would otherwise repeat on every interaction.
 *
 * The subtlety it encodes, learned the expensive way in an earlier milestone: **a compiled page may
 * only be cached against an immutable published version.** `(id, artifactVersion)` identifies a
 * published artifact and nothing else — a draft changes while keeping both, so an in-memory
 * definition has no version identity at all. This service therefore always compiles the definition it
 * is handed, and lets the loader's own cache handle the published case. The symptoms of getting it
 * wrong were a preview frozen at the first generated draft and a data source added mid-session that
 * was never queried.
 */

import { Injectable, inject, signal } from '@angular/core';
import { PageLoaderService, type CompiledPage } from '@opus/renderer';
import type { ValidationFinding } from '@opus/validator';
import { pageOf, text, type ExperienceDefinition, type Identifier } from '@opus/experience-model';

export interface PageLoadState {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  page?: CompiledPage;
  /** Plain text for a user, never a validation trace. */
  message?: string;
  /** The stage that failed, so the message can be specific about what went wrong. */
  stage?: string;
  /** Validation findings, for the inspector panel rather than for the user. */
  findings?: readonly ValidationFinding[];
}

@Injectable({ providedIn: 'root' })
export class ExperienceRuntimeService {
  private readonly loader = inject(PageLoaderService);

  readonly state = signal<PageLoadState>({ status: 'idle' });

  /**
   * Compile one page of an experience.
   *
   * `validate` defaults to true: the prototype validates every definition it renders, including its
   * own generated ones, because the point of the validation cascade is that a definition the
   * generator accepts cannot be one the runtime rejects. Turning it off for generated content would
   * remove the only evidence that the claim holds.
   */
  async open(
    experience: ExperienceDefinition,
    pageId: Identifier,
    options: { validate?: boolean } = {},
  ): Promise<PageLoadState> {
    this.state.set({ status: 'loading' });

    const page = pageOf(experience, pageId);
    if (!page) {
      const available = Object.keys(experience.pages ?? {});
      const next: PageLoadState = {
        status: 'failed',
        stage: 'resolve',
        message: available.length
          ? `This experience has no page "${pageId}". It has: ${available.join(', ')}.`
          : 'This experience has no pages yet.',
      };
      this.state.set(next);
      return next;
    }

    const outcome = await this.loader.loadDefinition(page, { validate: options.validate ?? true });

    if (!outcome.ok) {
      const next: PageLoadState = {
        status: 'failed',
        stage: outcome.stage,
        message: outcome.detail,
        findings: outcome.report?.findings,
      };
      this.state.set(next);
      return next;
    }

    const next: PageLoadState = {
      status: 'ready',
      page: outcome.page,
      findings: outcome.report?.findings,
    };
    this.state.set(next);
    return next;
  }

  /** The page's display name, for a title bar or a breadcrumb. */
  titleFor(experience: ExperienceDefinition, pageId: Identifier): string {
    const page = pageOf(experience, pageId);
    return page ? text(page.name, pageId) : pageId;
  }
}
