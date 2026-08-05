/**
 * Pratt parser for the expression grammar.
 *
 * Precedence, highest to lowest (schemas/expression-grammar.md §3.3):
 *   paths / calls / parens → unary not, unary minus → * / → + - →
 *   comparison and membership → and → or → ??
 */

import { type Node, type BinaryOp, SCOPE_ROOTS } from './ast';
import { ExpressionSyntaxError, tokenize, type Token } from './lexer';
import { FUNCTIONS } from './functions';

const BINARY_PRECEDENCE: Record<string, number> = {
  '??': 1,
  or: 2,
  and: 3,
  '==': 4,
  '!=': 4,
  '>': 4,
  '>=': 4,
  '<': 4,
  '<=': 4,
  in: 4,
  notIn: 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
};

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
  ) {}

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private next(): Token {
    return this.tokens[this.pos++]!;
  }

  private fail(message: string, token = this.peek()): never {
    throw new ExpressionSyntaxError(message, token.start, this.source);
  }

  parse(): Node {
    const node = this.parseExpression(0);
    if (this.peek().type !== 'eof') {
      this.fail(`Unexpected "${this.peek().value}"`);
    }
    return node;
  }

  private parseExpression(minPrecedence: number): Node {
    let left = this.parseUnary();

    for (;;) {
      const token = this.peek();
      let op: BinaryOp | undefined;
      let consume = 1;

      if (token.type === 'op' && BINARY_PRECEDENCE[token.value] !== undefined) {
        op = token.value as BinaryOp;
        // Grammar §3.2: binary minus must be whitespace-delimited on both sides.
        if (op === '-' && !(token.spaceBefore && token.spaceAfter)) {
          this.fail(
            'Binary "-" requires whitespace on both sides; hyphens bind inside path segments',
          );
        }
      } else if (token.type === 'ident' && (token.value === 'and' || token.value === 'or')) {
        op = token.value;
      } else if (token.type === 'ident' && token.value === 'in') {
        op = 'in';
      } else if (
        token.type === 'ident' &&
        token.value === 'not' &&
        this.tokens[this.pos + 1]?.type === 'ident' &&
        this.tokens[this.pos + 1]?.value === 'in'
      ) {
        op = 'notIn';
        consume = 2;
      }

      if (op === undefined) break;
      const precedence = BINARY_PRECEDENCE[op]!;
      if (precedence < minPrecedence) break;

      this.pos += consume;
      const right = this.parseExpression(precedence + 1);
      left = { kind: 'binary', op, left, right };
    }

    return left;
  }

  private parseUnary(): Node {
    const token = this.peek();
    if (token.type === 'ident' && token.value === 'not') {
      this.next();
      return { kind: 'unary', op: 'not', operand: this.parseUnary() };
    }
    if (token.type === 'op' && token.value === '-') {
      this.next();
      return { kind: 'unary', op: 'neg', operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const token = this.next();

    switch (token.type) {
      case 'number': {
        const value = Number(token.value);
        if (Number.isNaN(value)) this.fail(`Invalid number "${token.value}"`, token);
        return { kind: 'literal', value };
      }

      case 'string':
        return { kind: 'literal', value: token.value };

      case 'path': {
        const segments = token.segments ?? [];
        const root = segments[0]!;
        if (!(SCOPE_ROOTS as readonly string[]).includes(root)) {
          this.fail(
            `Unknown scope "$${root}". Available: ${SCOPE_ROOTS.map((r) => '$' + r).join(', ')}`,
            token,
          );
        }
        return { kind: 'path', segments, source: token.value };
      }

      case 'func': {
        const fn = FUNCTIONS[token.value];
        if (!fn) {
          this.fail(`Unknown function "${token.value}"`, token);
        }
        if (this.next().type !== 'lparen') this.fail('Expected "("', token);
        const args: Node[] = [];
        if (this.peek().type !== 'rparen') {
          for (;;) {
            args.push(this.parseExpression(0));
            if (this.peek().type === 'comma') {
              this.next();
              continue;
            }
            break;
          }
        }
        if (this.next().type !== 'rparen') this.fail('Expected ")"', token);
        if (args.length < fn.minArgs || (fn.maxArgs !== null && args.length > fn.maxArgs)) {
          const expected =
            fn.maxArgs === null
              ? `at least ${fn.minArgs}`
              : fn.minArgs === fn.maxArgs
                ? `${fn.minArgs}`
                : `${fn.minArgs}–${fn.maxArgs}`;
          this.fail(
            `Function "${token.value}" expects ${expected} argument(s), received ${args.length}`,
            token,
          );
        }
        return { kind: 'call', name: token.value, args, position: token.start };
      }

      case 'ident':
        if (token.value === 'true') return { kind: 'literal', value: true };
        if (token.value === 'false') return { kind: 'literal', value: false };
        if (token.value === 'null') return { kind: 'literal', value: null };
        this.fail(
          `Unexpected identifier "${token.value}". Paths must start with "$" and functions must be called`,
          token,
        );
      // falls through — fail() never returns

      case 'lparen': {
        const inner = this.parseExpression(0);
        if (this.next().type !== 'rparen') this.fail('Expected ")"', token);
        return inner;
      }

      case 'lbracket': {
        const items: Node[] = [];
        if (this.peek().type !== 'rbracket') {
          for (;;) {
            items.push(this.parseExpression(0));
            if (this.peek().type === 'comma') {
              this.next();
              continue;
            }
            break;
          }
        }
        if (this.next().type !== 'rbracket') this.fail('Expected "]"', token);
        return { kind: 'array', items };
      }

      default:
        this.fail(`Unexpected token "${token.value || token.type}"`, token);
    }
  }
}

export function parseExpression(source: string): Node {
  return new Parser(tokenize(source), source).parse();
}
