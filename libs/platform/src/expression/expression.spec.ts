import { describe, expect, it } from 'vitest';

import { ExpressionSyntaxError, tokenize } from './lexer';
import { parseExpression } from './parser';
import { collectReferences } from './ast';
import { compile } from './evaluate';

const evaluate = (source: string, scope: Record<string, unknown> = {}) =>
  compile(source).evaluate({ now: new Date('2026-08-04T12:00:00Z'), ...scope });

describe('lexer — hyphen rule (grammar §3.2)', () => {
  it('treats hyphens inside a path segment as part of the segment', () => {
    const tokens = tokenize('$row.asset-class');
    expect(tokens[0]!.type).toBe('path');
    expect(tokens[0]!.segments).toEqual(['row', 'asset-class']);
  });

  it('reads a whitespace-delimited minus as subtraction', () => {
    expect(evaluate('$row.a - $row.b', { row: { a: 10, b: 4 } })).toBe(6);
  });

  it('rejects a glued minus rather than silently misreading it', () => {
    // The documented rule: this is a parse error, not a guess about intent.
    expect(() => parseExpression('$row.a-$row.b')).toThrow(ExpressionSyntaxError);
  });

  it('supports bracket notation as an explicit escape', () => {
    expect(evaluate("$row['asset-class']", { row: { 'asset-class': 'BOND' } })).toBe('BOND');
  });

  it('rejects && and || in favour of the word forms', () => {
    expect(() => parseExpression('true && false')).toThrow(/word forms/);
  });
});

describe('parser — design-time errors', () => {
  it('rejects an unknown function', () => {
    expect(() => parseExpression('bogus(1)')).toThrow(/Unknown function "bogus"/);
  });

  it('rejects an unknown scope root', () => {
    expect(() => parseExpression('$nonsense.x')).toThrow(/Unknown scope/);
  });

  it('rejects the wrong argument count', () => {
    expect(() => parseExpression('round()')).toThrow(/expects 1–2 argument/);
  });

  it('rejects a bare identifier that is neither keyword nor call', () => {
    expect(() => parseExpression('severity == 1')).toThrow(/must start with "\$"/);
  });
});

describe('evaluator — operators', () => {
  it('applies documented precedence', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
  });

  it('short-circuits and / or', () => {
    expect(evaluate("$row.severity == 'HIGH' and $row.status != 'RESOLVED'", {
      row: { severity: 'HIGH', status: 'OPEN' },
    })).toBe(true);
    expect(evaluate("$row.severity == 'LOW' or $row.severity == 'HIGH'", {
      row: { severity: 'HIGH' },
    })).toBe(true);
  });

  it('supports in and not in', () => {
    expect(evaluate("$row.severity in ['HIGH', 'MEDIUM']", { row: { severity: 'HIGH' } })).toBe(true);
    expect(evaluate("$row.severity not in ['HIGH']", { row: { severity: 'LOW' } })).toBe(true);
  });

  it('coalesces with ??', () => {
    expect(evaluate('$row.missing ?? 7', { row: {} })).toBe(7);
    expect(evaluate('$row.present ?? 7', { row: { present: 0 } })).toBe(0);
  });

  it('yields null rather than throwing on division by zero', () => {
    expect(evaluate('1 / 0')).toBeNull();
  });

  it('yields null when comparing different types', () => {
    expect(evaluate("1 > 'a'")).toBeNull();
  });

  it('treats equality with null as identity, not as a type mismatch', () => {
    expect(evaluate('$row.missing == null', { row: {} })).toBe(true);
    expect(evaluate("$row.value == null", { row: { value: 3 } })).toBe(false);
  });
});

describe('evaluator — totality (grammar §6)', () => {
  it('returns null for a missing path instead of throwing', () => {
    expect(evaluate('$row.a.b.c', { row: {} })).toBeNull();
  });

  it('returns null for a path into a non-object', () => {
    expect(evaluate('$row.a.b', { row: { a: 5 } })).toBeNull();
  });
});

describe('evaluator — functions', () => {
  it('evaluates only the taken branch of if()', () => {
    expect(evaluate("if(true, 'yes', 1 / 0)")).toBe('yes');
  });

  it('formats with positional placeholders', () => {
    expect(evaluate("format('{0} of {1}', 3, 10)")).toBe('3 of 10');
  });

  it('computes date differences', () => {
    expect(
      evaluate("dateDiff($row.detected, now(), 'hour')", {
        row: { detected: '2026-08-04T06:00:00Z' },
      }),
    ).toBe(6);
  });

  it('rounds and divides safely', () => {
    expect(evaluate('round(safeDivide(1, 3) * 100, 1)')).toBe(33.3);
    expect(evaluate('safeDivide(1, 0)')).toBeNull();
  });

  it('resolves today() to midnight of the render instant', () => {
    const result = evaluate('today()') as Date;
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });
});

describe('evaluator — aggregates map over arrays', () => {
  const scope = {
    data: {
      queue: [
        { severity: 'HIGH', age: 10 },
        { severity: 'LOW', age: 30 },
        { severity: 'HIGH', age: 50 },
      ],
      header: { name: 'Vodafone Group PLC' },
    },
  };

  it('counts rows of a list source', () => {
    expect(evaluate('count($data.queue)', scope)).toBe(3);
  });

  it('sums and averages a field across rows', () => {
    expect(evaluate('sum($data.queue.age)', scope)).toBe(90);
    expect(evaluate('avg($data.queue.age)', scope)).toBe(30);
    expect(evaluate('maxOf($data.queue.age)', scope)).toBe(50);
  });

  it('counts rows matching a condition', () => {
    expect(evaluate("countWhere($data.queue.severity, 'eq', 'HIGH')", scope)).toBe(2);
  });

  it('reads a single-row source as an object', () => {
    expect(evaluate('$data.header.name', scope)).toBe('Vodafone Group PLC');
  });
});

describe('reference extraction — the invalidation graph input', () => {
  it('reports every scope reference without evaluating', () => {
    const refs = collectReferences(
      parseExpression("$params.as-of != null and $filters.severity in ['HIGH'] and $data.queue.age > 1"),
    );
    expect(refs.map((r) => `${r.root}:${r.name}`)).toEqual([
      'params:as-of',
      'filters:severity',
      'data:queue',
    ]);
  });

  it('reports references inside function arguments', () => {
    const refs = collectReferences(parseExpression('round($data.summary.count, 0)'));
    expect(refs).toEqual([{ root: 'data', name: 'summary', source: '$data.summary.count' }]);
  });
});

describe('sandbox', () => {
  it('offers no route to globals or prototypes', () => {
    expect(() => parseExpression('$window.location')).toThrow(/Unknown scope/);
    expect(evaluate('$row.constructor', { row: {} })).toBeNull();
    expect(evaluate('$row.__proto__', { row: {} })).toBeNull();
  });

  it('cannot call a function that is not in the closed library', () => {
    expect(() => parseExpression('eval("1")')).toThrow(/Unknown function/);
    expect(() => parseExpression('fetch("/x")')).toThrow(/Unknown function/);
  });
});
