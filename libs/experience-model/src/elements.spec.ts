/**
 * The four elements FR-18 and FR-19 add, and the checks that keep them from being decoration.
 *
 * Every test here is a way one of these elements can pass JSON Schema and still be meaningless — a
 * workflow that cannot run, a test impact analysis will never select, an approval anybody may sign.
 * That gap is the entire reason `checkExperienceElements` exists, so it is what gets tested.
 */

import { describe, expect, it } from 'vitest';

import approvalWorkspace from '../../../schemas/examples/approval-workspace.experience.json';
import securitiesOperations from '../../../schemas/examples/securities-operations.experience.json';
import {
  blockingElementProblems,
  checkExperienceElements,
  testsCovering,
  type ExperienceDefinition,
} from './index';

/**
 * A minimal experience, with only the parts these checks read.
 *
 * `overrides` is deliberately loose: the fixtures stub data sources and pages down to the fields under
 * test, and satisfying `DataSource` in full would bury each test's actual subject in scaffolding.
 */
function experience(overrides: Record<string, unknown> = {}): ExperienceDefinition {
  return {
    schemaVersion: '1.0.0',
    id: 'approvals',
    name: 'Approval Workspace',
    pages: { queue: { id: 'queue' }, detail: { id: 'detail' } },
    dataSources: { breaks: {} },
    actions: { submit: { kind: 'refresh' } },
    version: { schemaVersion: '1.0.0', artifactVersion: 1, lifecycleState: 'draft' },
    ...overrides,
  } as unknown as ExperienceDefinition;
}

describe('workflows', () => {
  it('accepts a workflow whose reach is a subset of what the experience declares', () => {
    const problems = checkExperienceElements(
      experience({
        workflows: {
          approve: {
            name: 'Approval',
            trigger: { kind: 'onAction', actionId: 'submit' },
            steps: [
              { id: 'review', name: 'Review', kind: 'approval', requiredCapabilities: ['experience.approve'] },
              { id: 'apply', name: 'Apply', kind: 'action', actionId: 'submit' },
            ],
          },
        },
      }),
    );
    expect(problems).toEqual([]);
  });

  it('refuses a step that invokes an action nobody declared', () => {
    // The design claim under test: a workflow cannot invent an action. Schema cannot express this.
    const problems = checkExperienceElements(
      experience({
        workflows: {
          approve: {
            name: 'Approval',
            steps: [{ id: 'apply', name: 'Apply', kind: 'action', actionId: 'doesNotExist' }],
          },
        },
      }),
    );
    const blocking = blockingElementProblems(problems);
    expect(blocking).toHaveLength(1);
    expect(blocking[0]?.path).toBe('/workflows/approve/steps/0/actionId');
    expect(blocking[0]?.message).toContain('subset of what the experience already declares');
  });

  it('finds an action declared on a page, not only on the experience', () => {
    /*
      Rejecting a page-level action would push authors to duplicate it at experience level purely to
      satisfy the checker, which would make the model worse rather than safer.
    */
    const problems = checkExperienceElements(
      experience({
        actions: undefined,
        pages: { queue: { id: 'queue', actions: { submit: { kind: 'refresh' } } } },
        workflows: {
          approve: {
            name: 'Approval',
            steps: [{ id: 'apply', name: 'Apply', kind: 'action', actionId: 'submit' }],
          },
        },
      }),
    );
    expect(blockingElementProblems(problems)).toEqual([]);
  });

  it('refuses a trigger pointing at an action that does not exist', () => {
    const problems = checkExperienceElements(
      experience({
        workflows: {
          approve: {
            name: 'Approval',
            trigger: { kind: 'onAction', actionId: 'ghost' },
            steps: [{ id: 'review', name: 'Review', kind: 'approval', requiredCapabilities: ['x.y'] }],
          },
        },
      }),
    );
    expect(blockingElementProblems(problems)[0]?.message).toContain('nothing can start this workflow');
  });

  it('refuses two steps sharing an id', () => {
    // Ids address a step in an audit record; two steps answering to one makes that record ambiguous.
    const problems = checkExperienceElements(
      experience({
        workflows: {
          approve: {
            name: 'Approval',
            steps: [
              { id: 'review', name: 'First', kind: 'approval', requiredCapabilities: ['x.y'] },
              { id: 'review', name: 'Second', kind: 'approval', requiredCapabilities: ['x.y'] },
            ],
          },
        },
      }),
    );
    expect(blockingElementProblems(problems)[0]?.message).toContain('identify one step');
  });

  it('warns, rather than blocks, on an approval anybody could complete', () => {
    /*
      A real problem — FR-33's accountability rests on a named approver — but a draft mid-authoring
      legitimately passes through this state, and an error would stop it being saved.
    */
    const problems = checkExperienceElements(
      experience({
        workflows: {
          approve: { name: 'Approval', steps: [{ id: 'review', name: 'Review', kind: 'approval' }] },
        },
      }),
    );
    expect(blockingElementProblems(problems)).toEqual([]);
    expect(problems[0]?.severity).toBe('warning');
    expect(problems[0]?.message).toContain('An approval without an approver is a formality');
  });
});

describe('aiContext', () => {
  it('warns when an experience replaces its product context rather than extending it', () => {
    // FR-19 wants extension. Standing alone is allowed and is worth saying out loud, because the
    // failure it produces is fluent rather than obviously broken.
    const problems = checkExperienceElements(
      experience({ aiContext: { extends: 'none' } }),
    );
    expect(problems[0]?.severity).toBe('warning');
    expect(problems[0]?.element).toBe('aiContext');
  });

  it('says nothing about the default, which is to extend', () => {
    const problems = checkExperienceElements(
      experience({
        aiContext: { terminology: [{ term: 'Break', means: 'An unresolved reconciliation exception' }] },
      }),
    );
    expect(problems).toEqual([]);
  });

  it('refuses a term defined twice', () => {
    const problems = checkExperienceElements(
      experience({
        aiContext: {
          terminology: [
            { term: 'Break', means: 'One thing' },
            { term: 'break', means: 'Another thing' },
          ],
        },
      }),
    );
    expect(blockingElementProblems(problems)[0]?.message).toContain('defined twice');
  });
});

describe('tests', () => {
  it('refuses coverage of a page the experience does not have', () => {
    const problems = checkExperienceElements(
      experience({
        tests: {
          t1: { name: 'Queue loads', expect: 'The queue shows open breaks', covers: { pages: ['ghost'] } },
        },
      }),
    );
    expect(blockingElementProblems(problems)[0]?.message).toContain('which this experience does not have');
  });

  it('accepts a data source declared on a page', () => {
    const problems = checkExperienceElements(
      experience({
        dataSources: undefined,
        pages: { queue: { id: 'queue', dataSources: { breaks: {} } } },
        tests: {
          t1: { name: 'Queue loads', expect: 'Rows appear', covers: { dataSources: ['breaks'] } },
        },
      }),
    );
    expect(blockingElementProblems(problems)).toEqual([]);
  });

  it('warns about a test that covers nothing, because the suite still counts it', () => {
    /*
      The quiet failure this exists for: structurally valid, contributes to a coverage count, and
      impact analysis can never select it — so a dependency change silently does not re-run it.
    */
    const problems = checkExperienceElements(
      experience({
        tests: { t1: { name: 'Something', expect: 'Something happens' } },
      }),
    );
    expect(problems[0]?.severity).toBe('warning');
    expect(problems[0]?.message).toContain('impact analysis can never select it');
  });
});

describe('test selection — FR-34, as a function', () => {
  const withTests = experience({
    dataSources: { breaks: {}, vendors: {} },
    tests: {
      queueTest: { name: 'Queue', expect: '…', covers: { pages: ['queue'] } },
      breaksTest: { name: 'Breaks', expect: '…', covers: { dataSources: ['breaks'] } },
      entityTest: { name: 'Exceptions', expect: '…', covers: { entities: ['dq.exception'] } },
    },
  });

  it('selects only the tests touching what changed', () => {
    expect(testsCovering(withTests, { dataSources: ['breaks'] })).toEqual(['breaksTest']);
    expect(testsCovering(withTests, { pages: ['queue'] })).toEqual(['queueTest']);
    expect(testsCovering(withTests, { entities: ['dq.exception'] })).toEqual(['entityTest']);
  });

  it('selects nothing when nothing relevant changed', () => {
    // FR-34: impact analysis "does not default to flagging the entire catalog on every change".
    expect(testsCovering(withTests, { entities: ['master.security'] })).toEqual([]);
  });

  it('selects a test once even when several of its references changed', () => {
    const multi = experience({
      tests: { both: { name: 'Both', expect: '…', covers: { pages: ['queue'], dataSources: ['breaks'] } } },
    });
    expect(testsCovering(multi, { pages: ['queue'], dataSources: ['breaks'] })).toEqual(['both']);
  });
});

/**
 * The shipped examples, checked.
 *
 * `npm run validate` proves they satisfy JSON Schema. That is exactly the half these checks exist to
 * cover the other side of — a workflow naming an action nobody declared is schema-valid — so the two
 * gates together are what make the examples worth copying from. Imported rather than read from disk
 * because these specs run in a browser environment, as the validator's shipped-artifacts gate does.
 */
describe('the shipped examples', () => {
  it('has an Approval Workspace whose workflow only reaches what it declares', () => {
    const problems = checkExperienceElements(approvalWorkspace as unknown as ExperienceDefinition);
    expect(problems).toEqual([]);
  });

  it('has a Securities Operations experience whose tests all cover something real', () => {
    const problems = checkExperienceElements(securitiesOperations as unknown as ExperienceDefinition);
    expect(problems).toEqual([]);
  });
});
