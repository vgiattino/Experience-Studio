/**
 * Referential checks for the four elements FR-18 and FR-19 add to an Experience.
 *
 * ── WHY THIS EXISTS RATHER THAN JUST THE SCHEMA ─────────────────────────────────────────
 * JSON Schema can say a workflow step has an `actionId`. It cannot say the action exists. That
 * difference is the whole distance between a model and scaffolding, and this repository's own
 * traceability document is unkind about elements that are "a type nothing enforces" — so adding four
 * of them without a check would have been adding four more.
 *
 * Every rule below is a way one of these elements can be structurally valid and still meaningless:
 * a workflow that cannot run because it invokes an action nobody declared, a test that claims to cover
 * a page that is not there, an approval anybody may sign.
 *
 * ── AND WHY IT LIVES HERE ───────────────────────────────────────────────────────────────
 * `@opus/validator` validates a *page*, against a catalog and a component registry. These are
 * *experience*-level and need neither — they are answerable from the definition alone. Putting them in
 * the validator would drag a catalog into a check that does not want one; putting them here keeps them
 * beside `describeExperience` and the rest of the experience-level vocabulary.
 */

import type { ExperienceDefinition, Identifier } from '@opus/contracts';

export interface ElementProblem {
  /** Which element the problem is in, so a UI can route it to the right panel. */
  element: 'workflows' | 'aiContext' | 'tests';
  /** JSON-Pointer-ish path to the offending node. */
  path: string;
  message: string;
  /**
   * `error` cannot work. `warning` works but is probably not what was meant.
   *
   * The same split `checkRegistration` uses in the ingestion library, for the same reason: refusing a
   * judgement somebody is entitled to make is how a check ends up being worked around.
   */
  severity: 'error' | 'warning';
}

/**
 * Check the workflows, AI context and tests against what the experience actually declares.
 *
 * Returns everything it finds rather than the first problem — an author fixing a workflow wants the
 * whole list, not one round trip per broken reference.
 */
export function checkExperienceElements(experience: ExperienceDefinition): ElementProblem[] {
  return [
    ...checkWorkflows(experience),
    ...checkAiContext(experience),
    ...checkTests(experience),
  ];
}

/** Only the problems that stop the element working. */
export function blockingElementProblems(
  problems: readonly ElementProblem[],
): ElementProblem[] {
  return problems.filter((problem) => problem.severity === 'error');
}

function declaredActions(experience: ExperienceDefinition): Set<string> {
  const ids = new Set<string>(Object.keys(experience.actions ?? {}));
  /*
    Page-level actions count too.

    A workflow step invoking an action declared on the page it runs from is legitimate, and rejecting it
    would push authors to duplicate the action at experience level purely to satisfy a checker — which
    is how a check makes a model worse.
  */
  for (const page of Object.values(experience.pages ?? {})) {
    if (page && typeof page === 'object' && 'actions' in page) {
      for (const id of Object.keys((page as { actions?: object }).actions ?? {})) ids.add(id);
    }
  }
  return ids;
}

function checkWorkflows(experience: ExperienceDefinition): ElementProblem[] {
  const problems: ElementProblem[] = [];
  const actions = declaredActions(experience);

  for (const [workflowId, workflow] of Object.entries(experience.workflows ?? {})) {
    const at = `/workflows/${workflowId}`;

    if (workflow.trigger?.kind === 'onAction') {
      if (!workflow.trigger.actionId) {
        problems.push({
          element: 'workflows',
          path: `${at}/trigger`,
          message: 'A trigger of kind "onAction" must name the action that starts the workflow.',
          severity: 'error',
        });
      } else if (!actions.has(workflow.trigger.actionId)) {
        problems.push({
          element: 'workflows',
          path: `${at}/trigger/actionId`,
          message: `No action "${workflow.trigger.actionId}" is declared by this experience or its pages, so nothing can start this workflow.`,
          severity: 'error',
        });
      }
    }

    const seen = new Set<Identifier>();
    workflow.steps.forEach((step, index) => {
      const stepAt = `${at}/steps/${index}`;

      if (seen.has(step.id)) {
        // Ids address a step in an audit record; two steps answering to one id makes that record
        // ambiguous about which decision was taken.
        problems.push({
          element: 'workflows',
          path: `${stepAt}/id`,
          message: `Two steps share the id "${step.id}". A step id has to identify one step for an audit record to mean anything.`,
          severity: 'error',
        });
      }
      seen.add(step.id);

      if (step.kind === 'action') {
        if (!step.actionId) {
          problems.push({
            element: 'workflows',
            path: stepAt,
            message: 'A step of kind "action" must name the action it invokes.',
            severity: 'error',
          });
        } else if (!actions.has(step.actionId)) {
          problems.push({
            element: 'workflows',
            path: `${stepAt}/actionId`,
            message: `No action "${step.actionId}" is declared by this experience or its pages. A workflow's reach is a subset of what the experience already declares — it cannot invent an action.`,
            severity: 'error',
          });
        }
      }

      if (step.kind === 'approval' && !step.requiredCapabilities?.length) {
        /*
          A warning, not an error. It is a real problem — an approval anybody can complete is not an
          approval, and FR-33's accountability rests on a named approver — but a draft mid-authoring
          legitimately passes through this state, and an error would block saving one.
        */
        problems.push({
          element: 'workflows',
          path: stepAt,
          message: `Approval step "${step.id}" names no required capability, so anyone who can open the experience could complete it. An approval without an approver is a formality.`,
          severity: 'warning',
        });
      }

      if (step.kind !== 'action' && step.actionId) {
        problems.push({
          element: 'workflows',
          path: `${stepAt}/actionId`,
          message: `Step "${step.id}" is an approval but names an action, which nothing will invoke. Remove it, or make the step an action step.`,
          severity: 'warning',
        });
      }
    });
  }

  return problems;
}

function checkAiContext(experience: ExperienceDefinition): ElementProblem[] {
  const context = experience.aiContext;
  if (!context) return [];

  const problems: ElementProblem[] = [];

  /*
    Standing alone is allowed and is worth saying out loud.

    FR-19 wants an experience to *extend* its product's vocabulary. `extends: 'none'` discards it, which
    is occasionally right and much more often a mistake nobody notices until the AI starts using a word
    the way the rest of the world does rather than the way this product does.
  */
  if (context.extends === 'none') {
    problems.push({
      element: 'aiContext',
      path: '/aiContext/extends',
      message:
        'This experience replaces its product AI Context rather than extending it, so none of the product\'s registered terminology grounds generation here. Deliberate is fine; accidental is a grounding failure that reads as fluent.',
      severity: 'warning',
    });
  }

  const terms = new Map<string, number>();
  (context.terminology ?? []).forEach((entry, index) => {
    const key = entry.term.trim().toLowerCase();
    if (terms.has(key)) {
      problems.push({
        element: 'aiContext',
        path: `/aiContext/terminology/${index}`,
        message: `"${entry.term}" is defined twice, with nothing to say which definition wins.`,
        severity: 'error',
      });
    }
    terms.set(key, index);
  });

  return problems;
}

function checkTests(experience: ExperienceDefinition): ElementProblem[] {
  const problems: ElementProblem[] = [];
  const pages = new Set(Object.keys(experience.pages ?? {}));
  const sources = new Set(Object.keys(experience.dataSources ?? {}));
  for (const page of Object.values(experience.pages ?? {})) {
    if (page && typeof page === 'object' && 'dataSources' in page) {
      for (const id of Object.keys((page as { dataSources?: object }).dataSources ?? {})) sources.add(id);
    }
  }

  for (const [testId, test] of Object.entries(experience.tests ?? {})) {
    const at = `/tests/${testId}`;

    /*
      A test that covers nothing is the one that quietly breaks impact analysis.

      It is structurally valid, it looks like coverage in a count, and FR-34 will never select it —
      so a metadata change that ought to re-run it silently does not. That is worse than having no
      test, because the count says otherwise.
    */
    const covers = test.covers;
    const coverage =
      (covers?.pages?.length ?? 0) + (covers?.dataSources?.length ?? 0) + (covers?.entities?.length ?? 0);
    if (coverage === 0) {
      problems.push({
        element: 'tests',
        path: at,
        message: `Test "${test.name}" declares no coverage, so impact analysis can never select it — a dependency change will not re-run it, while the suite still counts it.`,
        severity: 'warning',
      });
    }

    for (const [index, pageId] of (covers?.pages ?? []).entries()) {
      if (!pages.has(pageId)) {
        problems.push({
          element: 'tests',
          path: `${at}/covers/pages/${index}`,
          message: `Test "${test.name}" claims to cover page "${pageId}", which this experience does not have.`,
          severity: 'error',
        });
      }
    }

    for (const [index, sourceId] of (covers?.dataSources ?? []).entries()) {
      if (!sources.has(sourceId)) {
        problems.push({
          element: 'tests',
          path: `${at}/covers/dataSources/${index}`,
          message: `Test "${test.name}" claims to cover data source "${sourceId}", which is declared neither on this experience nor on any of its pages.`,
          severity: 'error',
        });
      }
    }
  }

  return problems;
}

/**
 * The tests a change to these refs should re-run — FR-34's selection, as a function.
 *
 * Small enough to be obvious, and here rather than in impact analysis because it is a fact about the
 * experience rather than about the change. What makes it work at all is that `covers` is checked
 * above: a selector over references nobody validated returns confident nonsense.
 */
export function testsCovering(
  experience: ExperienceDefinition,
  changed: { pages?: readonly string[]; dataSources?: readonly string[]; entities?: readonly string[] },
): string[] {
  const pages = new Set(changed.pages ?? []);
  const sources = new Set(changed.dataSources ?? []);
  const entities = new Set(changed.entities ?? []);

  return Object.entries(experience.tests ?? {})
    .filter(([, test]) => {
      const covers = test.covers;
      if (!covers) return false;
      return (
        (covers.pages ?? []).some((id) => pages.has(id)) ||
        (covers.dataSources ?? []).some((id) => sources.has(id)) ||
        (covers.entities ?? []).some((ref) => entities.has(ref))
      );
    })
    .map(([id]) => id);
}
