/**
 * Evaluator and compiler for the expression grammar.
 *
 * Expressions are compiled once at page-compile time and evaluated many times.
 * Evaluation is total: a missing path, a type mismatch or a division by zero
 * yields null rather than throwing (grammar §6), so one bad expression degrades
 * one widget rather than failing a page.
 */

import { collectReferences, type Node, type ScopeReference } from './ast';
import { parseExpression } from './parser';
import { FUNCTIONS, type FunctionContext } from './functions';

export interface EvaluationScope {
  params?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  selections?: Record<string, unknown>;
  data?: Record<string, unknown>;
  user?: Record<string, unknown>;
  tenant?: Record<string, unknown>;
  page?: Record<string, unknown>;
  row?: Record<string, unknown>;
  tab?: Record<string, unknown>;
  event?: Record<string, unknown>;
  /** Render-pass instant. Constant within a pass so expressions stay deterministic. */
  now?: Date;
  locale?: string;
  timezone?: string;
}

export interface CompiledExpression {
  readonly source: string;
  readonly references: readonly ScopeReference[];
  readonly evaluate: (scope: EvaluationScope) => unknown;
  /** Coerces the result to boolean using the platform's truthiness rules. */
  readonly test: (scope: EvaluationScope) => boolean;
}

/** Truthiness: only genuinely absent or false values are false. Empty arrays are false. */
export function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (value === 0) return false;
  if (value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Read one segment. OWN PROPERTIES ONLY.
 *
 * Plain property access would reach inherited members, so `$row.constructor`
 * would return `Object` and hand an expression a route to the prototype chain.
 * The grammar states the sandbox has no prototype access; this is where that is
 * enforced, and expression.spec.ts asserts it.
 */
function readOwn(target: unknown, segment: string): unknown {
  if (target === null || typeof target !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(target, segment)) return null;
  const value = (target as Record<string, unknown>)[segment];
  // Never surface anything callable: expressions compute, they do not invoke.
  return typeof value === 'function' ? null : (value ?? null);
}

function resolvePath(segments: string[], scope: EvaluationScope): unknown {
  const [root, ...rest] = segments;

  if (root === 'now') return scope.now ?? new Date(0);

  let current: unknown = readOwn(scope, root!);
  if (current === null) return null;

  for (const segment of rest) {
    if (current === null || current === undefined) return null;

    // A path into an array maps over its elements, so sum($data.x.field) works
    // without the grammar needing iteration. An EMPTY array resolves to null, not
    // to an empty array: a denied or empty data source must let `?? 0` supply a
    // fallback rather than interpolating nothing into a sentence.
    if (Array.isArray(current)) {
      if (current.length === 0) return null;
      current = current.map((item) => readOwn(item, segment));
      continue;
    }

    current = readOwn(current, segment);
  }

  return current ?? null;
}

const sameType = (a: unknown, b: unknown): boolean => {
  if (a instanceof Date && b instanceof Date) return true;
  return typeof a === typeof b;
};

function compare(op: string, left: unknown, right: unknown): boolean | null {
  if (op === '==' || op === '!=') {
    const nullish = (v: unknown) => v === null || v === undefined;
    if (nullish(left) || nullish(right)) {
      const equal = nullish(left) && nullish(right);
      return op === '==' ? equal : !equal;
    }
    if (!sameType(left, right)) return null;
    const equal =
      left instanceof Date && right instanceof Date
        ? left.getTime() === right.getTime()
        : left === right;
    return op === '==' ? equal : !equal;
  }

  // Ordering comparisons against null, or across types, are undefined.
  if (left === null || right === null || left === undefined || right === undefined) return null;
  const l = left instanceof Date ? left.getTime() : left;
  const r = right instanceof Date ? right.getTime() : right;
  if (!sameType(l, r)) return null;
  if (typeof l !== 'number' && typeof l !== 'string') return null;

  switch (op) {
    case '>':
      return (l as number) > (r as number);
    case '>=':
      return (l as number) >= (r as number);
    case '<':
      return (l as number) < (r as number);
    case '<=':
      return (l as number) <= (r as number);
    default:
      return null;
  }
}

function arithmetic(op: string, left: unknown, right: unknown): unknown {
  if (op === '+' && (typeof left === 'string' || typeof right === 'string')) {
    // Only concatenate when a side is genuinely text; otherwise fall through to numeric.
    if (typeof left === 'string' && typeof right === 'string') return left + right;
  }
  const l = typeof left === 'number' ? left : Number(left);
  const r = typeof right === 'number' ? right : Number(right);
  if (!Number.isFinite(l) || !Number.isFinite(r)) return null;
  switch (op) {
    case '+':
      return l + r;
    case '-':
      return l - r;
    case '*':
      return l * r;
    case '/':
      return r === 0 ? null : l / r;
    default:
      return null;
  }
}

function membership(value: unknown, collection: unknown): boolean {
  const items = Array.isArray(collection) ? collection : collection === null ? [] : [collection];
  return items.some(
    (item) => item === value || (item !== null && value !== null && String(item) === String(value)),
  );
}

function evaluateNode(node: Node, scope: EvaluationScope, fnCtx: FunctionContext): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value;

    case 'array':
      return node.items.map((item) => evaluateNode(item, scope, fnCtx));

    case 'path':
      return resolvePath(node.segments, scope);

    case 'unary': {
      if (node.op === 'not') return !truthy(evaluateNode(node.operand, scope, fnCtx));
      const value = evaluateNode(node.operand, scope, fnCtx);
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? -n : null;
    }

    case 'binary': {
      switch (node.op) {
        case 'and':
          return (
            truthy(evaluateNode(node.left, scope, fnCtx)) &&
            truthy(evaluateNode(node.right, scope, fnCtx))
          );
        case 'or':
          return (
            truthy(evaluateNode(node.left, scope, fnCtx)) ||
            truthy(evaluateNode(node.right, scope, fnCtx))
          );
        case '??': {
          const left = evaluateNode(node.left, scope, fnCtx);
          return left === null || left === undefined
            ? evaluateNode(node.right, scope, fnCtx)
            : left;
        }
        case 'in':
          return membership(
            evaluateNode(node.left, scope, fnCtx),
            evaluateNode(node.right, scope, fnCtx),
          );
        case 'notIn':
          return !membership(
            evaluateNode(node.left, scope, fnCtx),
            evaluateNode(node.right, scope, fnCtx),
          );
        case '+':
        case '-':
        case '*':
        case '/':
          return arithmetic(
            node.op,
            evaluateNode(node.left, scope, fnCtx),
            evaluateNode(node.right, scope, fnCtx),
          );
        default:
          return compare(
            node.op,
            evaluateNode(node.left, scope, fnCtx),
            evaluateNode(node.right, scope, fnCtx),
          );
      }
    }

    case 'call': {
      const fn = FUNCTIONS[node.name]!;
      if (fn.lazy) {
        return fn.apply([], {
          ...fnCtx,
          evaluate: (index: number) => evaluateNode(node.args[index]!, scope, fnCtx),
        });
      }
      const args = node.args.map((arg) => evaluateNode(arg, scope, fnCtx));
      return fn.apply(args, fnCtx);
    }
  }
}

/**
 * Compile an expression source string. Throws ExpressionSyntaxError for a
 * malformed expression — that is a design-time failure, surfaced to the author
 * or to the AI repair loop, never to a viewer.
 */
export function compile(source: string): CompiledExpression {
  const ast = parseExpression(source);
  const references = Object.freeze(collectReferences(ast));

  const run = (scope: EvaluationScope): unknown => {
    const fnCtx: FunctionContext = {
      now: scope.now ?? new Date(),
      timezone: scope.timezone ?? 'UTC',
      locale: scope.locale ?? 'en-GB',
    };
    try {
      return evaluateNode(ast, scope, fnCtx);
    } catch {
      // Total evaluation (grammar §6): never propagate a runtime fault.
      return null;
    }
  };

  return {
    source,
    references,
    evaluate: run,
    test: (scope) => truthy(run(scope)),
  };
}

/** Compile with caching, keyed by source. Page compilation reuses shared expressions. */
const cache = new Map<string, CompiledExpression>();

export function compileCached(source: string): CompiledExpression {
  let compiled = cache.get(source);
  if (!compiled) {
    compiled = compile(source);
    cache.set(source, compiled);
  }
  return compiled;
}
