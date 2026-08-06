# Catalog Ingestion — registering and scanning a database

How an enterprise database becomes a governed business vocabulary. Implemented in
`libs/catalog-ingest` (`@opus/catalog-ingest`), surfaced as the **Sources** tab of the Catalog
workspace.

MS SQL Server is the first dialect, because that is where Opus EDM lives: vendor and source
registers, processing tables, exception data, and mastered data for a range of industry use cases.

---

## Why this exists

Everything the platform does rests on the semantic catalog. Pages bind to it, AI generation is
grounded in it, the validator checks against it, and the Data Gateway enforces entitlements over it.
Until now the catalog was hand-authored JSON — which is fine for a proof of concept and impossible
for a real deployment, where an EDM database has hundreds of tables and thousands of columns.

The naive answer is a generator: read the schema, write the catalog. It produces a catalog whose
vocabulary is a database's internals. A scan of a real `dbo` schema finds staging tables, audit
tables, ETL bookkeeping columns and a `PASSWORD_HISTORY` somebody left behind, and business users
then search a "governed" catalog full of `ROWID_BATCH_SEQ`.

So ingestion is five steps with five artifacts, and the separations are the design:

| Step | Artifact | Where |
| --- | --- | --- |
| **1. Register** | `SourceRegistration` — metadata; the credential is a *reference* | `source.ts` |
| **2. Scan** | `PhysicalSchema` — what the database says about itself | `mssql-probe.ts` |
| **3. Infer** | `CatalogDraft` — a proposal where every decision carries its reason | `infer.ts` |
| **4. Review and promote** | `RawCatalog` — merged, from a steward's decisions | `promote.ts` |
| **5. Re-scan and diff** | `DriftReport` — what changed and what it breaks | `drift.ts` |

---

## The port: no driver dependency

`SqlExecutor` is the entire seam between this library and a database:

```ts
interface SqlExecutor {
  readonly label: string;                 // "mssql://host/db", never a connection string
  query(sql: string, params?: Record<string, unknown>): Promise<SqlRow[]>;
}
```

Three consequences, each worth the discipline:

- **the library depends on no database driver**, so nothing here changes when a driver version does;
- **the introspection SQL is reviewable on its own** — one file, readable by a DBA who is being asked
  to grant the login that runs it;
- **every path is testable without a server.** `fixture-source.ts` answers the same statements over a
  realistic Opus EDM schema, so inference, promotion, drift and the UI are all exercised for real.

A deployment supplies about fifteen lines:

```ts
import sql from 'mssql';

export async function executorFor(source: SourceRegistration): Promise<SqlExecutor> {
  const pool = await new sql.ConnectionPool({
    server: source.host,
    port: source.port,
    database: source.database,
    // Resolved server-side from the *name* held in the registration. The secret never travels.
    ...(source.auth === 'sqlLogin'
      ? { user: source.username, password: await secrets.get(source.secretRef!) }
      : { authentication: { type: 'ntlm' } }),
    options: {
      encrypt: source.encrypt,
      trustServerCertificate: source.trustServerCertificate,
      readOnlyIntent: true,
    },
  }).connect();

  return {
    label: `mssql://${source.host}/${source.database}`,
    async query(text, params = {}) {
      const request = pool.request();
      for (const [name, value] of Object.entries(params)) request.input(name, value);
      return (await request.query(text)).recordset;
    },
  };
}
```

### Where the scan runs today

In the browser, against the fixture. A browser cannot open a TDS connection — SQL Server's wire
protocol is not HTTP — so the Sources screen says so above anything that looks like a result. The
deployment step is the route above; the SQL, the type mapping, the inference, the review and the
diff are the code that runs in production, unchanged.

---

## 1. Register — the credential rule

**A credential never reaches the client.** A registration is split in two: what the source *is*
(kind, host, database, schemas — metadata a reviewer reads and an audit log records) and how the
platform *authenticates* to it (`secretRef`, the name of a secret the server resolves).

They are kept apart because a connection string with a password in it, sent to a browser once, is a
password in that browser's memory, in its devtools, and in every error report it uploads.
`redactForClient` is the only function that produces the shape a UI receives, and it is written
field by field rather than as a spread with deletions — a spread that forgets a new field ships it,
and the field most likely to be added to `SourceRegistration` later is another credential.

`checkRegistration` refuses, before anything is stored or connected:

| Refusal | Why |
| --- | --- |
| A host containing `;` or `=` | `db;Initial Catalog=other;Integrated Security=true` is a connection-string injection, and the driver would honour it |
| `password=` in any field | However it got there |
| An empty schema list | Scanning everything a login can see finds system catalogs and other applications' tables |
| A schema or database that is not an identifier | It is interpolated into SQL, so it is validated first |
| A SQL login with no `secretRef` | The platform stores a reference, never a password |
| `encrypt: false` | Credentials and rows in clear text |
| `trustServerCertificate: true` | Defeats the encryption above it |

`HOST\INSTANCE` is accepted, because that is a host on SQL Server and not an injection.

---

## 2. Scan — real T-SQL, read-only

Six statements, exported as constants so they can be reviewed, tested, and read by the DBA granting
the login: `SQL_TABLES`, `SQL_COLUMNS`, `SQL_PRIMARY_KEYS`, `SQL_FOREIGN_KEYS`, `SQL_CHECKS`,
`SQL_VERSION`, plus the opt-in `enumerationSql`.

**Every statement is a SELECT** and there is a test asserting it. Schema names arrive as a parameter
through `STRING_SPLIT(@schemas, ',')`, so a schema list typed into a form cannot become SQL. The
three things no dialect can parameterise — schema, table and column names, needed only for the
optional enumeration sample — go through `quoteIdentifier`, which validates against an identifier
pattern *and then* bracket-quotes with `]` doubled. Validate-then-quote rather than either alone:
quoting a string that was never an identifier still executes, and validating without quoting breaks
on a legal-but-reserved name like `[order]`.

### Why `sys.*` and not `INFORMATION_SCHEMA` throughout

The standard views are used where sufficient. They are not sufficient for three things, and each
omission would be a silent hole:

- **row counts** (`sys.partitions`). Row count decides whether an entity may be queried unfiltered,
  so guessing wrong makes a page that is fine in a demo and times out in production.
- **computed and identity columns**. A page may read a generated column and must never write it.
- **foreign keys as a unit**. `sys.foreign_key_columns` carries the ordinal, so composite
  relationships come out paired correctly.

### Degradation

A login without `VIEW DEFINITION` sees tables and no columns; one without access to `sys.partitions`
gets no row counts. Both are normal in a governed estate, so each optional statement is attempted and
its failure recorded as a `warning` — a partial scan with a reason, rather than an empty result or an
exception thrown at a steward.

### Enumeration sampling

Off by default, and the default matters: it is the only part of a scan that reads *data* rather than
metadata. A steward turns it on knowingly, because "the values in this column" is a disclosure in a
way "this column exists" is not, and because on a billion-row table it is an expensive question.
Tables over `enumSampleRowLimit` are skipped with a warning naming them.

Most enumerations do not need it. A `CHECK` constraint is where a code list is usually written down,
and reading it costs one statement against metadata.

---

## 3. Infer — a draft, with reasons

`infer(schema)` produces a `CatalogDraft`: entities, attributes, measures, relationships, and
`problems`. Every inference carries a `Decision { what, because, confidence }`, and the review screen
renders the *because* beside the result. A review screen that showed only conclusions would be a
screen whose only available action is to trust it.

It is deterministic — same schema in, byte-identical draft out. No clock, no randomness, every
collection sorted. That is what makes a re-scan diffable, which is what makes drift detection
possible.

### What it refuses

- **A table with no primary key does not become an entity.** Every read path needs to identify a row:
  a detail page, a drill-down, a selection, a cache key. Inventing a surrogate — "the first column
  looks unique" — produces a page whose row identity is wrong in exactly the cases that matter,
  duplicates and history rows. A **view** gets a different message, because a view cannot declare a
  primary key in SQL Server, so "add one" is not advice a steward can act on.
- **Types with no honest mapping are reported, not coerced.** `varbinary`, `xml`, `geography`,
  `sql_variant` and the CLR types. A `varbinary` is not a string, and making it one puts a megabyte
  of base64 in a table cell. Refusing is also the safe direction: an attribute that exists is
  bindable, and a bindable column whose type is a guess is a page that fails at render time in front
  of a business user.
- **Relationships come only from declared foreign keys.** `SECURITY_ID` on a table with no constraint
  to `dbo.SECURITY` might be a reference, a free-text field, or a reference to a system this database
  does not contain. A constraint is checked by the server; a name is not.

### The one inference it deliberately does not make

**It does not invent measures for subsets.** A `Status` column with values Open, Late and Failed does
not become `late-count` and `failed-count`. It becomes one count measure and a groupable status
attribute.

That is a direct lesson from this repository's own fixture catalog, where `late-file-count` and
`failed-file-count` exist with no definition of what makes a file late — so the gateway counts every
row and a generated page displays "Late Files 90" beside "Files Processed 90". A subset is expressed
by filtering or grouping, where the condition is visible and checkable. Two measures that differ by a
condition nobody wrote down are two labels over one number.

### Judgement calls, and why each falls the way it does

| Decision | Rule | Because |
| --- | --- | --- |
| An `int` named `*_ID` | `identifier`, not `integer` | Otherwise a vendor id renders as "1,240" and is offered for summing |
| A `char(3)` currency code | groupable | "Exceptions by currency" is an ordinary question, and the SQL type cannot tell you a three-character column is a closed set — the semantic type can |
| The primary key | never groupable | One bucket per row by definition |
| A *personal* identifier | never groupable | A count of one in a bucket labelled with somebody's tax number names that person. An aggregate is the shape people assume is anonymous |
| A duration (`AGE_HOURS`, `ELAPSED_MS`) | `avg`/`min`/`max`, no `sum` | The sum of ages is not a meaningful number |
| A percentage | no `sum` | A percentage cannot be summed |
| `higherIsBetter` | unset unless the name says it | It drives threshold colours, so a wrong guess paints a page green while it reports a problem. A higher exception count is worse, a higher coverage percentage is better, and a higher notional is neither |
| `rate` in a name | *not* a percentage | An interest rate is one and an exchange rate is not; there is no way to tell. Guessing made `SPOT_RATE` render 1.2734 as "127.34%" |
| Free text | not groupable | Grouping produces one bucket per row — a chart of 40,000 categories |
| A label attribute | a name-ish column, then a non-key non-FK identifier, then nothing | Returning nothing is valid: the key is honest, where labelling by the first string column produces "Security: GBP" on every breadcrumb. A foreign key is excluded because a column that identifies a *different* row must never label this one |

### Naming

`EXCPTN_STS` becomes "Exception Status". Modelling prefixes and suffixes are stripped (`TBL_`,
`_DIM`, `_MASTER`), acronyms stay upper (`Exception ID`, not `Exception Id`), and a schema name
repeated in its own table name goes — `dq.DQ_EXCEPTION` becomes `dq.exception`, "Exception", because
the platform's namespace is not flat and the repetition was there to make names unique in one that
was.

The separator in those patterns is mandatory, which is not a detail: with it optional, the `f`
alternative strips the leading letter of `FILE_LOAD` and the entity comes out named "Ile Load".

Singular and plural are naive on purpose. A steward is reviewing every name anyway, so "Statuses"
being right and "Analysis" being wrong is a one-word edit, where a dictionary of irregular English
nouns is a dependency, a maintenance burden, and still wrong for a domain's own coinages.

---

## 4. Promote — the gate

`promote(draft, decisions, base, context)` merges a reviewed draft into the catalog.

**Inclusion is explicit.** Nothing reaches the catalog because a scan found it: every entity,
attribute and measure is there because a `StewardDecisions` entry says `include: true`.
`defaultDecisions()` exists so the review starts from "all of it" rather than an empty form — but
that default is data a UI renders and a person submits, not a code path that promotes unreviewed.

### Three rules it enforces whatever the decisions say

1. **A suspected-personal column needs an entitlement or an explicit acknowledgement.** Without one
   it is left out and reported. Defaulting the other way makes the first promotion of an HR-adjacent
   schema a disclosure, and "the steward clicked accept" is not a control. The flag itself is
   conservative in both directions — it catches an email address, a date of birth, a tax identifier,
   and deliberately does not catch "name", because in a securities master a name is an instrument's
   and crying PII over every name teaches a steward to click past the warnings that matter. A steward
   entitles a customer name themselves; that is the acknowledged trade-off of the list.
2. **An entity needs a row entitlement.** `projectionFor` treats an absent one as "everyone", so an
   entity promoted without one is visible to every user of the tenant. One is derived from the domain
   and reported, rather than omitted: an over-tight default is a support ticket, an absent one is a
   leak. The consequence is worth expecting — publish ten entities and none appear in the Vocabulary
   tab until the capabilities are granted. The screen says so, because that looks exactly like the
   publish having failed.
3. **Entities the catalog already has are never dropped.** A source that stops exposing a table keeps
   its entity, marked and reported. Un-breaking a page is much harder than deleting an entity a
   steward meant to delete.

It also refuses, rather than dropping quietly: an entity whose key was not fully included, a measure
over an excluded column, a relationship whose join columns are not both exposed. Each would otherwise
fail at query time, on a page, in front of a user.

### Merge, not replace

A catalog spans sources, so the merge is keyed on `physical.sourceId` and everything else is carried
through untouched. `RawEntity` gained a server-only `physical` block for this — the table an entity
reads. Attributes already carried their column; the table was the one physical fact the catalog did
not record, which left a re-scan unable to answer "which entity is built on the table that just
changed". `projectionFor` builds `CatalogEntity` field by field, so it never crosses to a client.

Each promotion appends to `catalog.audit`: who approved it, what was scanned, when, and which
entities went in.

Notes carry a `code` as well as a message. The message is what a steward reads; the code is what a
screen groups by — ten entities produce ten near-identical "no row entitlement was set" notes, and a
list that prints all ten buries the refusals that need a decision.

---

## 5. Drift — what changed, and what it breaks

The naive design re-scans, re-infers and replaces. It is wrong in a way that only shows up in
production: a DBA renames `EXCPTN_STS` to `EXCEPTION_STATUS`, the next scan produces a catalog with a
new attribute and without the old one, and every page that grouped by exception status silently loses
its dimension. Nobody is told, because replacing a catalog is not an event — it looks like a scan that
worked.

So `detectDrift(previous, current, catalog)` diffs the new scan against the promoted one and reads the
diff *against the catalog*, to answer the only question a steward has: which pages stop working.

Severity is about the catalog, not the database:

| | Meaning | Example |
| --- | --- | --- |
| `breaking` | Something the catalog references no longer exists or has changed shape | A dropped column under a bound measure; a changed primary key; `decimal` becoming `nvarchar` |
| `behavioural` | It still runs; what it returns has changed meaning | `NOT NULL` becoming nullable; a value disappearing from a code list |
| `additive` | Nothing that worked stops working | A new table or column; a widened `varchar`; a column that has *become* a code list |

The same dropped column is `breaking` under a dashboard's KPI and `additive` housekeeping if nothing
references it. A report that cries breaking over every unreferenced column is a report a steward
learns to skim.

Two categories exist for reasons worth stating:

- **Widened nullability is its own thing.** It breaks nothing and changes everything: an average
  silently starts excluding rows, a count of a column stops matching a count of rows, and a KPI moves
  for a reason no business user can find. "It still works" and "it is still correct" are different
  claims.
- **A row count "moving" is a proportion.** A fact table growing by ten thousand rows a day is not
  news; a lookup table going from 40 rows to 40 million is. `approxRows` is an estimate, so a tight
  threshold would report noise on every scan.

`PhysicalSchema` records whether the scan sampled values, because a diff that does not know it
reports a false alarm: re-scanning without sampling, after a scan that sampled, makes every
discovered code list look as though it vanished from the database. Drift says "this scan did not look"
instead.

---

## The fixture

`fixture-source.ts` is an `SqlExecutor` over a realistic Opus EDM schema — the four areas of a real
deployment:

| Schema | Tables |
| --- | --- |
| `vendor` | `VENDOR`, `VENDOR_FEED` — providers under contract and the deliveries they owe |
| `processing` | `FILE_LOAD`, `LOAD_STEP`, `LOAD_RECONCILIATION` — what arrived and how it went |
| `dq` | `DQ_RULE`, `DQ_EXCEPTION`, `V_EXCEPTION_BY_VENDOR` — what was wrong and who is fixing it |
| `master` | `SECURITY_MASTER`, `LEGAL_ENTITY`, `CUSTOMER_ACCOUNT`, `PRODUCT` — mastered data across industries |

The breadth is doing work. It puts the awkward cases in front of the pipeline in a test instead of
leaving them for production: a 240-million-row child table; `varbinary`, `xml` and `geography`
columns; computed and identity columns; a reconciliation table with no key *and* a view with none —
the two different reasons a thing cannot become an entity, with the two different messages; a
self-referencing foreign key; a foreign key pointing at a schema that was not scanned; and a customer
master whose columns are unambiguously personal, so the promotion gate is exercised on real column
names rather than a contrived `PII_FIELD`.

It answers *statements*, not a canned `PhysicalSchema`, so the probe's own logic runs in every test:
five result sets folded together, foreign keys paired by ordinal, `CHECK` definitions parsed, columns
sorted so two scans compare equal. The clock is fixed by default, which is what makes "the pipeline
is deterministic" a test rather than a claim.

What it does not do is stand in for a real server. A deployment's first scan against a real instance
is still the moment the SQL is proven.

---

## The Sources screen

`apps/studio/src/app/catalog/` — a tab of the Catalog workspace, beside Vocabulary. One rail entry,
because a business analyst asks one question ("what can I build a page about") and Sources is not a
second answer to it; it is the same subject from the other end, read in sequence.

Both panes stay alive when the other is showing. A steward part-way through reviewing ninety
attributes who looks something up in the vocabulary must not come back to an empty form.

The review is the screen. The register form is eleven fields and the scan is a button; the part that
took the design is a machine having proposed a business vocabulary and a steward having to decide
whether it is right. So every inference is rendered with its reason and its confidence, and
**refusals are as prominent as results** — the two tables that cannot become entities, the columns
with no honest type, the foreign key pointing outside the scan, and the personal columns awaiting an
entitlement are all on the screen at the same size as the ten entities that worked. A scan reported
as "10 entities found" is a scan whose gaps a steward discovers later, from a page that does not work.

A promotion installs its result into the live `CatalogService`, so the effect is the point rather than
a report: the builder's entity picker, the AI's grounding pack and the validator all read the same
service.

---

## Adding a dialect

`SourceKind` exists from the first driver rather than after the second, because the introspection SQL,
the type mapping and the identifier quoting are all dialect-specific and a design that hardcodes one
has to be unpicked to add another. To add PostgreSQL:

1. a `PostgresProbe implements SchemaProbe` over `pg_catalog` / `information_schema`;
2. a type table for its types, with the same "refuse rather than coerce" rule;
3. its own `quoteIdentifier` (double quotes, `"` doubled);
4. a fixture executor answering its statements;
5. add `'postgres'` to `IMPLEMENTED_KINDS`.

`infer.ts`, `promote.ts` and `drift.ts` are dialect-independent and need no changes.

---

## Tests

`libs/catalog-ingest/src/catalog-ingest.spec.ts`, weighted deliberately. The tests that matter are
not the ones checking that a happy path produces entities — they are the ones checking that the
pipeline *refuses*: a credential in a host field, a table with no key, a personal column with no
entitlement, a subset measure with no filter, an expression misread as a value list. Ingestion is a
machine writing the vocabulary a business will make decisions in, and the failure mode worth testing
is the one where it writes something plausible and wrong.

Two tests are about the whole pipeline rather than a stage: a promoted catalog is loaded into
`CatalogService` and projected under a real entitlement set, and the gateway's physical map is read
back off it. A catalog this produces has to be one the platform can actually use.

---

## Verified in a browser

Driven in Chromium, assertions read out of the DOM rather than off a screenshot.

| Checked | Result |
| --- | --- |
| Scan | 12 objects, 11 tables and 1 view, server version and the server's clock reported |
| Inference | 10 entities, 2 blocked with the two different messages, 7 relationships, 3 unmappable columns named |
| Decisions rendered | every attribute shows its reason and confidence; `LIKELY`, `GUESS`, `CERTAIN` distinguished |
| Personal columns | 6 refused at promotion, each naming what to do; typing a capability admits one and labels it `pii` |
| Publish | installed into the live `CatalogService`; the physical map reads back for the gateway |
| Entitlement consequence | "0 of 10 appear in Vocabulary for Priya Raman right now", with the four derived capabilities named on one line rather than ten |
| Drift | re-scan with sampling on reports `master.PRODUCT.CATEGORY` as a new code list of 6, `additive` |
| Register form | a connection string in the host field draws two problems and Register stays disabled; a SQL login demands a username and a secret *name* |
| Credential rule | after registering with `kv/edm/reader`, neither the secret name nor the username appears anywhere in the DOM |
| Dark theme | 0px page overflow, no errors |
| 950px | 0px page overflow; the wide attribute table scrolls inside its own box |
| Console | no errors on any path |

Gate: metadata validation passed, 494 unit tests passed (up from 405), all three apps build with no
budget warnings.

**Known limitation, pre-existing:** below 900px the shell hides the nav rail
(`chrome.scss`, from the CODA port), so every workspace behind it — Catalog, and the EDM Page Builder —
is unreachable on a phone. Not introduced here and not fixed here: the rail needs a narrow-viewport
affordance of its own, which affects every workspace rather than this one.

---

## Next

1. **The server route.** The fifteen lines above, plus a source store, so a scan reads a real
   instance. Everything above the port is done.
2. **Synonyms and AI hints from the review.** `RawAttribute.synonyms` and `aiHints` are what make
   natural-language generation find a concept, and a steward reviewing ninety attributes is exactly
   the person who knows that "break" means `dq.exception`. The decision shape already carries
   `synonyms`; the screen does not yet offer it.
3. **Drift on a schedule.** Nothing yet re-scans on its own. A nightly scan that diffs and reports
   `breaking` changes is the difference between finding out from this screen and finding out from a
   page.
4. **Second dialect.** PostgreSQL, to prove the seam is where it claims to be.
