/**
 * Validate, server-side — the precondition FR-33's `submit` gates on.
 *
 * ── WHY THIS IS REAL VALIDATION AND NOT A SHAPE CHECK ───────────────────────────────────
 * FR-33 asks that Validate perform "structural and data-binding checks (that referenced
 * metadata/components/actions actually exist and are compatible)". That is exactly what
 * `@opus/validator` does, so this runs the real thing rather than a server-side approximation of it:
 * levels 1, 2, 3, 4 and 7 over every page of the experience, against the catalog this deployment has
 * actually published.
 *
 * ── THE TWO THINGS THAT MADE IT POSSIBLE ────────────────────────────────────────────────
 *   · **`@opus/validator` has no Angular imports.** It is a plain library over the schemas, so the
 *     server can call it. Checked before relying on it.
 *   · **Manifests are read from disk, not from the component registry.** `loadAllManifests()` resolves
 *     the Angular *component* alongside its manifest, which would drag the framework into this process
 *     for data the manifests already hold as JSON. Reading the files is the same information without
 *     the dependency.
 *
 * ── AND WHY THE FULL CATALOG, NOT THE CALLER'S PROJECTION ───────────────────────────────
 * `projectionFor` exists and is entitlement-scoped, which is right for reads and wrong here: an author
 * who cannot see an entity would get level-3 failures about a page that is perfectly correct.
 * Validation is a question about the artifact, not about who is asking.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ExperienceDefinition } from '@opus/contracts';
import { checkExperienceElements, type ElementProblem } from '@opus/experience-model';
import { validatePage } from '@opus/validator';

import { PATHS } from '../config';
import { storedCatalog } from './catalog';

export interface ExperienceValidation {
  valid: boolean;
  /** Levels that actually ran, so "not checked" is never reported as "passed". */
  levelsRun: readonly string[];
  pages: readonly { pageId: string; valid: boolean; findings: readonly ValidationLine[] }[];
  /** Experience-level referential problems — workflows and tests. See `checkExperienceElements`. */
  elements: readonly ElementProblem[];
}

export interface ValidationLine {
  level: string;
  severity: string;
  path?: string;
  message: string;
}

let manifestCache: unknown[] | null = null;

/**
 * Every component manifest, from `libs/components/*​/*.manifest.json`.
 *
 * Cached for the process: manifests ship with the build and cannot change under a running server, so
 * re-reading six files per validation would be work with no question attached.
 */
function manifests(): unknown[] {
  if (manifestCache) return manifestCache;
  const found: unknown[] = [];
  if (existsSync(PATHS.components)) {
    for (const entry of readdirSync(PATHS.components, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = join(PATHS.components, entry.name, `${entry.name}.manifest.json`);
      if (existsSync(file)) found.push(JSON.parse(readFileSync(file, 'utf8')));
    }
  }
  manifestCache = found;
  return found;
}

function manifestTypes(list: readonly unknown[]): string[] {
  return list
    .map((m) => (m as { type?: string; id?: string }).type ?? (m as { id?: string }).id)
    .filter((t): t is string => typeof t === 'string');
}

/**
 * Validate every page of an experience, plus its experience-level elements.
 *
 * A page that is a `$pageRef` is skipped and *said* to be skipped rather than passed. The store
 * resolves refs at seed time, so this only happens for an artifact that reached the server unresolved —
 * and reporting an unchecked page as valid is the failure this whole function exists to prevent.
 */
export function validateExperience(experience: ExperienceDefinition): ExperienceValidation {
  const catalog = storedCatalog();
  const list = manifests();
  const types = manifestTypes(list);

  const pages: { pageId: string; valid: boolean; findings: ValidationLine[] }[] = [];
  const levels = new Set<string>();

  for (const [pageId, page] of Object.entries(experience.pages ?? {})) {
    if (page && typeof page === 'object' && '$pageRef' in page) {
      pages.push({
        pageId,
        valid: false,
        findings: [
          {
            level: 'structural',
            severity: 'error',
            message: `Page "${pageId}" is an unresolved $pageRef, so it could not be validated. A stored experience holds whole pages; a reference here means the artifact never went through the store's seed resolution.`,
          },
        ],
      });
      continue;
    }

    const report = validatePage(page, {
      manifests: list as never,
      registeredTypes: types as never,
      // Level 3 is reported as NOT RUN when there is no catalog, rather than assumed to have passed.
      ...(catalog ? { catalog: catalog as never } : {}),
    });

    for (const level of report.levelsRun ?? []) levels.add(level);
    const findings: ValidationLine[] = (report.findings ?? []).map((f) => ({
      level: String(f.level),
      severity: String(f.severity),
      ...(f.path ? { path: String(f.path) } : {}),
      message: String(f.message),
    }));
    pages.push({
      pageId,
      valid: !findings.some((f) => f.severity === 'error'),
      findings,
    });
  }

  const elements = checkExperienceElements(experience);

  return {
    valid:
      pages.every((p) => p.valid) && !elements.some((problem) => problem.severity === 'error'),
    levelsRun: [...levels],
    pages,
    elements,
  };
}
