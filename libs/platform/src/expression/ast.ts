/** AST node types for the expression grammar. */

export type Node =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'array'; items: Node[] }
  | { kind: 'path'; segments: string[]; source: string }
  | { kind: 'call'; name: string; args: Node[]; position: number }
  | { kind: 'unary'; op: 'not' | 'neg'; operand: Node }
  | { kind: 'binary'; op: BinaryOp; left: Node; right: Node };

export type BinaryOp =
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | '+'
  | '-'
  | '*'
  | '/'
  | 'and'
  | 'or'
  | 'in'
  | 'notIn'
  | '??';

/** Scope roots the grammar recognises (schemas/expression-grammar.md §2). */
export const SCOPE_ROOTS = [
  'params',
  'filters',
  'selections',
  'data',
  'user',
  'tenant',
  'page',
  'row',
  'tab',
  'event',
  'now',
] as const;

export type ScopeRoot = (typeof SCOPE_ROOTS)[number];

/** A dependency an expression has on page state. Drives the invalidation graph. */
export interface ScopeReference {
  root: ScopeRoot;
  /** First segment after the root, where one exists — the parameter, channel or data source id. */
  name?: string;
  source: string;
}

/** Collect every scope reference in an AST, without evaluating it. */
export function collectReferences(node: Node, out: ScopeReference[] = []): ScopeReference[] {
  switch (node.kind) {
    case 'path': {
      const [root, name] = node.segments;
      if (root && (SCOPE_ROOTS as readonly string[]).includes(root)) {
        out.push({ root: root as ScopeRoot, name, source: node.source });
      }
      break;
    }
    case 'array':
      node.items.forEach((n) => collectReferences(n, out));
      break;
    case 'call':
      node.args.forEach((n) => collectReferences(n, out));
      break;
    case 'unary':
      collectReferences(node.operand, out);
      break;
    case 'binary':
      collectReferences(node.left, out);
      collectReferences(node.right, out);
      break;
    case 'literal':
      break;
  }
  return out;
}
