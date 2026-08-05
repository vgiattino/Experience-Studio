/**
 * Lexer for the Experience Studio expression grammar.
 * Specification: schemas/expression-grammar.md
 *
 * The one subtle rule (grammar §3.2): hyphens are part of a path segment, because
 * every identifier in the metadata model is kebab-case and requiring bracket
 * notation everywhere would make expressions unreadable. Binary `-` therefore
 * requires whitespace on both sides. The lexer records whitespace adjacency and
 * the parser enforces it, so `$row.a-b` is one path and `$row.a-$row.b` is a
 * parse error rather than a silent misreading.
 */

export type TokenType =
  | 'number'
  | 'string'
  | 'path'
  | 'func'
  | 'ident'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'lbracket'
  | 'rbracket'
  | 'eof';

export interface Token {
  type: TokenType;
  /** Raw text for ops/idents; for paths, the dotted source. */
  value: string;
  /** For path tokens: resolved segments, with bracket quoting removed. */
  segments?: string[];
  start: number;
  spaceBefore: boolean;
  spaceAfter: boolean;
}

export class ExpressionSyntaxError extends Error {
  constructor(
    message: string,
    readonly position: number,
    readonly source: string,
  ) {
    super(`${message} (at ${position} in "${source}")`);
    this.name = 'ExpressionSyntaxError';
  }
}

const KEYWORDS = new Set(['and', 'or', 'not', 'in', 'true', 'false', 'null']);

const isDigit = (c: string) => c >= '0' && c <= '9';
const isAlpha = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isAlnum = (c: string) => isAlpha(c) || isDigit(c);
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/** Multi-character operators, longest first so `>=` wins over `>`. */
const OPERATORS = ['??', '==', '!=', '>=', '<=', '>', '<', '+', '-', '*', '/'];

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const push = (t: Omit<Token, 'spaceBefore' | 'spaceAfter'>, spaceBefore: boolean) => {
    tokens.push({ ...t, spaceBefore, spaceAfter: false });
  };

  while (i < source.length) {
    let sawSpace = false;
    while (i < source.length && isSpace(source[i]!)) {
      sawSpace = true;
      i++;
    }
    if (sawSpace && tokens.length > 0) tokens[tokens.length - 1]!.spaceAfter = true;
    if (i >= source.length) break;

    const start = i;
    const c = source[i]!;

    // ── string literal
    if (c === "'" || c === '"') {
      const quote = c;
      i++;
      let out = '';
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < source.length) {
          out += source[i + 1];
          i += 2;
        } else {
          out += source[i];
          i++;
        }
      }
      if (i >= source.length) {
        throw new ExpressionSyntaxError('Unterminated string literal', start, source);
      }
      i++; // closing quote
      push({ type: 'string', value: out, start }, sawSpace);
      continue;
    }

    // ── number literal
    if (isDigit(c)) {
      while (i < source.length && (isDigit(source[i]!) || source[i] === '.')) i++;
      push({ type: 'number', value: source.slice(start, i), start }, sawSpace);
      continue;
    }

    // ── path
    if (c === '$') {
      i++;
      if (!isAlpha(source[i] ?? '')) {
        throw new ExpressionSyntaxError('Expected a scope name after "$"', start, source);
      }
      const rootStart = i;
      while (i < source.length && isAlnum(source[i]!)) i++;
      const segments = [source.slice(rootStart, i)];

      for (;;) {
        if (source[i] === '.' && isAlnum(source[i + 1] ?? '')) {
          i++;
          const segStart = i;
          while (i < source.length && isAlnum(source[i]!)) i++;
          // hyphens bind inside a segment, but only when glued to alphanumerics
          while (source[i] === '-' && isAlnum(source[i + 1] ?? '')) {
            i++;
            while (i < source.length && isAlnum(source[i]!)) i++;
          }
          segments.push(source.slice(segStart, i));
          continue;
        }
        if (source[i] === '[') {
          const bracketStart = i;
          i++;
          const quote = source[i];
          if (quote !== "'" && quote !== '"') {
            throw new ExpressionSyntaxError(
              'Bracket access requires a quoted segment name',
              bracketStart,
              source,
            );
          }
          i++;
          const segStart = i;
          while (i < source.length && source[i] !== quote) i++;
          const seg = source.slice(segStart, i);
          i++; // closing quote
          if (source[i] !== ']') {
            throw new ExpressionSyntaxError('Expected "]"', i, source);
          }
          i++;
          segments.push(seg);
          continue;
        }
        break;
      }

      push({ type: 'path', value: source.slice(start, i), segments, start }, sawSpace);
      continue;
    }

    // ── identifier, keyword, or function call
    if (isAlpha(c)) {
      while (i < source.length && isAlnum(source[i]!)) i++;
      const word = source.slice(start, i);
      let j = i;
      while (j < source.length && isSpace(source[j]!)) j++;
      if (source[j] === '(' && !KEYWORDS.has(word)) {
        push({ type: 'func', value: word, start }, sawSpace);
      } else {
        push({ type: 'ident', value: word, start }, sawSpace);
      }
      continue;
    }

    // ── punctuation
    if (c === '(') {
      i++;
      push({ type: 'lparen', value: '(', start }, sawSpace);
      continue;
    }
    if (c === ')') {
      i++;
      push({ type: 'rparen', value: ')', start }, sawSpace);
      continue;
    }
    if (c === ',') {
      i++;
      push({ type: 'comma', value: ',', start }, sawSpace);
      continue;
    }
    if (c === '[') {
      i++;
      push({ type: 'lbracket', value: '[', start }, sawSpace);
      continue;
    }
    if (c === ']') {
      i++;
      push({ type: 'rbracket', value: ']', start }, sawSpace);
      continue;
    }

    // ── operators
    const op = OPERATORS.find((o) => source.startsWith(o, i));
    if (op) {
      i += op.length;
      push({ type: 'op', value: op, start }, sawSpace);
      continue;
    }

    if (c === '&' || c === '|') {
      throw new ExpressionSyntaxError(
        `Unsupported operator "${c}" — use the word forms "and" / "or"`,
        start,
        source,
      );
    }

    throw new ExpressionSyntaxError(`Unexpected character "${c}"`, start, source);
  }

  tokens.push({ type: 'eof', value: '', start: source.length, spaceBefore: true, spaceAfter: true });
  return tokens;
}
