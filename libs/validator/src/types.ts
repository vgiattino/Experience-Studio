/** Validation result shape, shared by the loader, the Studio and (later) the AI repair loop. */

import type { ErrorCategory } from '@opus/contracts';

/**
 * The eight validation levels (schemas/README.md §5). M1 implements 1, 2, 4, 7
 * and the reserved-kind check; levels 3, 5, 6 and 8 need the catalog service and
 * the Data Gateway. Reporting the level on every finding means an unimplemented
 * level is visibly absent rather than silently assumed to have passed.
 */
export type ValidationLevel =
  | 'structural'
  | 'component'
  | 'semantic'
  | 'binding'
  | 'entitlement'
  | 'cost'
  | 'layout'
  | 'accessibility';

export type Severity = 'error' | 'warning';

export interface ValidationFinding {
  level: ValidationLevel;
  severity: Severity;
  category: ErrorCategory;
  /** JSON Pointer into the artifact. */
  path: string;
  code: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  status: 'valid' | 'validWithWarnings' | 'invalid';
  levelsRun: readonly ValidationLevel[];
  levelsNotRun: readonly ValidationLevel[];
  findings: readonly ValidationFinding[];
  durationMs: number;
}

export const LEVELS_REQUIRING_SERVER: readonly ValidationLevel[] = [
  'semantic',
  'entitlement',
  'cost',
  'accessibility',
];

export function summarize(
  findings: readonly ValidationFinding[],
  levelsRun: readonly ValidationLevel[],
  durationMs: number,
): ValidationReport {
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  return {
    valid: errors.length === 0,
    status: errors.length ? 'invalid' : warnings.length ? 'validWithWarnings' : 'valid',
    levelsRun,
    levelsNotRun: LEVELS_REQUIRING_SERVER.filter((l) => !levelsRun.includes(l)),
    findings,
    durationMs,
  };
}
