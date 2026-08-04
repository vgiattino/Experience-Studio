# Expression Grammar

Status: **Draft for approval**
Applies to: every `{ "$expr": "..." }` value in the metadata model.

Expressions supply the small amount of computed behaviour a declarative page model needs — visibility rules, conditional formatting, thresholds, computed labels, dynamic tab conditions. They are deliberately the weakest part of the model. Anything that needs more power than this grammar provides belongs in the semantic catalog as a governed measure, or in a component, not in a page definition.

---

## 1. Design Constraints

| Constraint | Reason |
|---|---|
| **Pure and side-effect free** | Expressions are evaluated during validation, during AI cost estimation, in tests, and repeatedly during rendering. Any side effect would make those contexts differ. |
| **Not Turing-complete** | No loops, no recursion, no user-defined functions. Evaluation cost is bounded by the size of the expression. |
| **Sandboxed** | No `eval`, no `Function` constructor, no prototype access, no property access outside the supplied scope, no network, no DOM, no timers. |
| **Statically analysable** | The compiler reports every scope reference an expression makes, so the renderer can add the expression to the data invalidation graph without executing it. |
| **Deterministic** | Same scope, same result. `now()` and `today()` are resolved once per render pass from the render context, not per evaluation. |
| **Total** | Every expression returns a value or `null`. Type errors and missing paths yield `null` rather than throwing, so one bad expression degrades one widget rather than failing a page. |

An expression is compiled once, at page-compile time, into a pure function, and wrapped in a computed signal over its declared scope references. It therefore participates in the reactive graph rather than running on every change detection pass.

---

## 2. Scope

The evaluation scope is fixed. Nothing else is reachable.

| Root | Contents | Available in |
|---|---|---|
| `$params` | Page and experience parameter values | Everywhere |
| `$filters` | Current filter channel values | Everywhere |
| `$selections` | Current selection channel values | Everywhere |
| `$data` | Results of data sources on this page, by id | Everywhere (see §2.1) |
| `$user` | `id`, `displayName`, `locale`, `timezone`, `roles`, `capabilities` | Everywhere |
| `$tenant` | `id`, `displayName` | Everywhere |
| `$page` | `id`, `kind`, `breakpoint`, `environment` | Everywhere |
| `$row` | The current row | Inside a tabular or repeated context |
| `$tab` | `id`, `label`, `row` for a data-driven tab | Inside a tab template |
| `$event` | The payload of the triggering component event | Inside action parameter mapping only |
| `$now` | Render-time instant | Everywhere |

**`$user.roles` and `$user.capabilities` are readable, and reading them is never authorization.** They exist so a page can avoid showing an affordance that would fail. Enforcement is server-side, in the Data Gateway and the platform authorization layer, resolved from the caller's identity — never from an expression. An expression that returns `true` grants nothing.

### 2.1 `$data` access

`$data.<dataSourceId>.<fieldAlias>` reads a field of a `single`-kind data source, or an aggregate with no dimensions. For `list` and dimensioned `aggregate` sources, `$data.<id>` is a row collection reachable only through the aggregate functions in §4 — an expression cannot iterate rows.

Referencing `$data` creates a dependency: the expression re-evaluates when that source's result changes, and the compiler records the edge in the invalidation graph.

---

## 3. Syntax

### 3.1 Literals

```
42        3.14      -7
'text'    "text"
true      false     null
[1, 2, 3]           ['HIGH', 'MEDIUM']
```

### 3.2 Paths

```
$params.as-of
$row.severity
$data.security-header.asset-class
$tab.row.party-id
$user.locale
```

**Hyphens are permitted in path segments.** Identifiers in this model are kebab-case, so requiring bracket notation for every field reference would make expressions unreadable. The lexer resolves the ambiguity with a rule that must be honoured by any implementation:

> Inside a path, `-` is part of the segment. As a binary operator, `-` **requires whitespace on both sides**.

So `$row.late-count` is one path, `$row.a - $row.b` is subtraction, and `$row.a-$row.b` is a parse error rather than a silent misreading. Bracket notation `$row['late-count']` is also accepted as an explicit escape.

### 3.3 Operators

| Category | Operators | Notes |
|---|---|---|
| Comparison | `==` `!=` `>` `>=` `<` `<=` | No coercion between types; comparing different types yields `null` |
| Membership | `in` `not in` | Right side must be an array |
| Logical | `and` `or` `not` | Short-circuiting; word forms only, so `&&` is a parse error |
| Arithmetic | `+` `-` `*` `/` | Whitespace required around `-`; division by zero yields `null` |
| Null handling | `??` | Coalesce |
| Grouping | `( )` | |

Precedence, highest to lowest: paths and calls, unary `not`, `* /`, `+ -`, comparison and membership, `and`, `or`, `??`.

### 3.4 Conditional

```
if(condition, whenTrue, whenFalse)
```

A function rather than a ternary operator, so there is one call syntax and no dangling-else ambiguity. Both branches are lazily evaluated.

---

## 4. Function Library

Closed set. A function not listed here is a validation error, not a runtime failure — so an AI-generated expression calling an invented function is caught at design time.

### Null and type

`isNull(v)` · `isEmpty(v)` · `coalesce(a, b, …)` · `toNumber(v)` · `toText(v)` · `toDate(v)`

### Text

`concat(a, b, …)` · `upper(s)` · `lower(s)` · `trim(s)` · `contains(s, sub)` · `startsWith(s, p)` · `endsWith(s, p)` · `length(s)` · `substring(s, start, len)` · `replace(s, find, with)` · `split(s, sep)` · `format(template, …)`

`format` substitutes positional `{0}`, `{1}` placeholders and is the only way to build display text. String concatenation of untrusted values into anything interpreted is impossible by construction: expression results are always rendered as text through the framework's sanitization, never as markup.

### Numeric

`abs(n)` · `round(n, dp)` · `floor(n)` · `ceil(n)` · `min(a, b, …)` · `max(a, b, …)` · `clamp(n, lo, hi)` · `percentChange(from, to)` · `safeDivide(a, b)`

### Date and time

`now()` · `today()` · `dateAdd(d, n, unit)` · `dateDiff(a, b, unit)` · `startOf(d, unit)` · `endOf(d, unit)` · `isBefore(a, b)` · `isAfter(a, b)` · `businessDaysBetween(a, b)`

`unit` ∈ `minute` `hour` `day` `week` `month` `quarter` `year` `businessDay`. `now()` and `today()` resolve from render context in the user's timezone and are constant within a render pass.

### Aggregate over a data source

`count($data.x)` · `sum($data.x.field)` · `avg($data.x.field)` · `minOf($data.x.field)` · `maxOf($data.x.field)` · `anyMatch($data.x.field, value)` · `countWhere($data.x.field, operator, value)`

These are the only way to reach across rows. They are intentionally limited: a real cross-row calculation belongs in a catalog measure, where it is named, governed, entitlement-checked and reusable, rather than buried in a page.

### Arrays

`arrayContains(arr, v)` · `arrayLength(arr)` · `first(arr)` · `arrayJoin(arr, sep)`

---

## 5. Worked Examples

Conditional tab for an asset class — the mechanism behind asset-specific tabs:
```
$data.security-header.asset-class == 'BOND'
```

Conditional formatting on a grid row:
```
$row.severity == 'HIGH' and $row.status != 'RESOLVED'
```

Ageing emphasis:
```
dateDiff($row.detected, now(), 'hour') > 24
```

Computed label:
```
format('{0} of {1} rules failing', count($data.failing-rules), $data.rule-summary.total)
```

Hide an affordance the user could not use anyway — a convenience, not a control:
```
'dataQuality.remediate' in $user.capabilities
```

Threshold band from a comparison:
```
percentChange($data.previous.value, $data.current.value) < -5
```

Tab-scoped filter value inside a data-driven tab:
```
$tab.row.party-id
```

Safe division for a rate:
```
round(safeDivide($row.matched, $row.total) * 100, 1)
```

---

## 6. Validation and Errors

At **design time**, the compiler rejects: parse errors; unknown functions; unknown scope roots; wrong argument counts; references to data sources, parameters, filters or fields that do not exist on the page; `$row` used outside a row context; `$tab` used outside a tab template; `$event` used outside action parameter mapping. These are reported with a path into the definition, so both the Studio and the AI repair loop can act on them.

At **runtime**, expressions do not throw. A missing path, a type mismatch, or a division by zero yields `null`. Where `null` is not a usable result, the consuming component falls back to its declared state — an unresolvable `visible` condition is treated as `true` for layout stability and logged, rather than making a widget silently disappear.

---

## 7. Deliberate Omissions

| Omitted | Why, and what to use instead |
|---|---|
| Loops and iteration | Row-level work belongs in a `repeater` container or a data source, both of which the renderer can plan and cost. |
| User-defined functions | Reuse belongs in the catalog as a measure, where it is governed and versioned. |
| Regular expressions | Unbounded evaluation cost, a denial-of-service surface, and unreadable in a business tool. |
| Assignment and mutation | Purity is required for validation-time evaluation and for signal-based re-evaluation. |
| Arbitrary data-source row iteration | Aggregates only. A calculation worth doing across rows is worth naming in the catalog. |
| HTML or markup output | Expression results are always text. This removes an injection surface entirely rather than mitigating it. |
| Calling actions | Expressions compute; actions act. Keeping the two separate is what makes expressions safe to evaluate during validation. |

---

## 8. Decisions Requiring Ratification

| # | Decision | Consequence if reversed later |
|---|---|---|
| E1 | Closed function library, validated at design time | Invented functions become runtime failures |
| E2 | Hyphenated path segments with whitespace-delimited binary minus | Either unreadable expressions or a silent parsing hazard |
| E3 | Total evaluation — `null` rather than exceptions | One bad expression can fail a page |
| E4 | `$user.capabilities` readable but never authoritative | Invites treating a page definition as a security boundary |
| E5 | Aggregates only over data sources; no row iteration | Business logic migrates from the governed catalog into ungoverned page definitions |
| E6 | Text-only output, no markup | Reintroduces an injection surface |
