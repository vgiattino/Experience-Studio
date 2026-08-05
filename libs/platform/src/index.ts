/**
 * @opus/platform — cross-cutting runtime services.
 * Layer 2: may depend on contracts only.
 */

export { tokenize, ExpressionSyntaxError, type Token, type TokenType } from './expression/lexer';
export {
  collectReferences,
  SCOPE_ROOTS,
  type Node as ExpressionNode,
  type ScopeReference,
  type ScopeRoot,
} from './expression/ast';
export { parseExpression } from './expression/parser';
export { FUNCTIONS, FUNCTION_NAMES } from './expression/functions';
export {
  compile,
  compileCached,
  truthy,
  type CompiledExpression,
  type EvaluationScope,
} from './expression/evaluate';

export { formatValue, resolveThreshold, type FormatContext } from './format';
export {
  BREAKPOINT_MIN_WIDTH,
  breakpointForWidth,
  resolvePlacement,
  type ResolvedPlacement,
} from './breakpoint';
export {
  TelemetryService,
  type ProblemRecord,
  type QueryRecord,
  type RenderRecord,
} from './telemetry.service';
