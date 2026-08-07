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

### Where the scan runs

**Against a real SQL Server, through the backend.** `server/sources/mssql-executor.ts` is the adapter
above — a pool, a query, and four decisions made explicitly:

1. **Read-only intent, and a read-only login.** `readOnlyIntent` routes to a secondary replica where
   one exists, which is where a schema scan belongs. It is a hint, so the real protection is the login:
   `db_datareader` plus `VIEW DEFINITION`, and `tools/fixture-ddl.mjs` emits exactly those grants for a
   DBA to read.
2. **Bounded time**, separately for the connection and the statement, because they are different
   failures with the same symptom.
3. **The credential is resolved in one place** (`server/sources/secrets.ts`), read once, passed to the
   driver, never stored on the object, logged, or included in an error. Driver errors go through a
   redaction pass in case a future version starts echoing its config.
4. **Pools are cached per source and closed after each scan** — a held connection is one nobody can
   drain when they take the database down.

The browser talks to `/api/sources`. When that is not answering, the *same* pipeline runs in the
browser over `FixtureExecutor`, and the screen says which — a green "Live" banner naming the driver, or
a note saying the backend is not running and to start it with `npm run api`. The distinction is
rendered rather than logged, because a scan that appears to have read production and did not is the
worst thing this surface could imply.

### The API

| Route | Does |
| --- | --- |
| `GET /api/sources` | The roster, redacted |
| `POST /api/sources` | Register. Refuses on blocking problems; records accepted warnings |
| `DELETE /api/sources/:id` | Deregister, and close its pool |
| `POST /api/sources/:id/test` | Connect, read the version, disconnect — the cheapest question worth asking, and the one a steward has when a scan fails |
| `POST /api/sources/:id/scan` | Scan, infer, and diff against the promoted baseline |
| `POST /api/sources/:id/promote` | **Re-scan**, re-infer, promote, publish |

Every route requires `catalog.edit`, and that is not boilerplate. A draft carries physical table and
column names, and the platform's standing rule is that `physical` never reaches a client. The review
screen is the deliberate exception because it cannot do its job without them — a steward asked "is
`EXCPTN_STS` the column you mean by Exception Status?" needs to see `EXCPTN_STS`. So the exception is
scoped: a caller holding catalog stewardship, on a source they registered, in a payload that is a draft
and not a catalog. An analyst calling the same routes gets a 403 that says so.

**Promotion re-scans rather than trusting the schema the client holds.** This is the load-bearing
decision of the API. Accepting a posted schema would let a client dictate the physical mapping the
gateway then queries through, which is an injection with extra steps. It also closes a real race: a
review that takes twenty minutes is twenty minutes in which a column can be dropped. The decisions are
the steward's and come from the client; the *facts* are re-read from the database.

### Storage

Registrations and the promoted scan go to `server/data/sources/`, written atomically. The draft is not
persisted — it is a pure function of a scan, so a second copy would only drift. The promoted scan is,
because drift is a diff against it and a restart that silently reset the baseline would make the next
re-scan report "nothing changed" about a database that changed.

A promotion writes `server/data/catalog.json` and hydrates it, in that order: hydrating first would
leave a process serving a catalog that does not survive its own restart. The checked-in seed at
`apps/viewer/public/catalog/` is never touched, so using the product does not make `git status` dirty,
and deleting the published file is the documented way back to a known starting point.

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

What it does not do is stand in for a real server — which is why `tools/verify-real-scan.mjs` exists.

### Proving the fixture against a real server

`tools/fixture-ddl.mjs` emits the fixture as SQL Server DDL; `tools/verify-real-scan.mjs` scans the
resulting database and diffs it against the fixture scan. Generated rather than hand-written, because
the comparison only means something if both sides describe the same database — and generation
guarantees the *logical* schema matches while deliberately not guaranteeing how SQL Server *reports*
it, which is the part under test.

```
docker run -d --name opus-edm-sql -e ACCEPT_EULA=Y -e 'MSSQL_SA_PASSWORD=<password>' \
  -e MSSQL_PID=Developer -p 11433:1433 mcr.microsoft.com/mssql/server:2022-latest
node tools/fixture-ddl.mjs > /tmp/opus-edm.sql
docker cp /tmp/opus-edm.sql opus-edm-sql:/tmp/ && docker exec opus-edm-sql \
  /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P '<password>' -C -i /tmp/opus-edm.sql
SCAN_PASSWORD='<password>' npx tsx tools/verify-real-scan.mjs
```

Against SQL Server 2022 CU26 it reports **0 substantive differences**, an identical inferred draft, and
two consecutive real scans that are byte-identical. Row counts and the clock are excluded and the script
prints that it excluded them: the DDL creates the schema and inserts nothing, and cost class, the
unfiltered-query threshold and drift's proportional row-count test all key off `sys.partitions`.

It earned its place immediately. `sys.columns` populates `max_length`, `precision` and `scale` for
*every* column, not only where a length was declared — so a real `int` arrives with `max_length: 4` and
a real `nvarchar(200)` with `400`. Drift's type label rendered those as "int(4)" and "nvarchar(400)",
and `datetime2(3)` as "datetime2(23,3)". No fixture-based test could see it, because the fixture omitted
the fields a real server always sends.

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

A promotion has an effect rather than producing a report. Over the API the server writes and hydrates
the catalog and the client re-fetches its projection; in fixture mode the browser installs the result
into its own `CatalogService`, which the builder's entity picker, the AI's grounding pack and the
validator all read.

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

## Running it

```
# 1. a SQL Server to scan
docker run -d --name opus-edm-sql -e ACCEPT_EULA=Y -e 'MSSQL_SA_PASSWORD=<password>' \
  -e MSSQL_PID=Developer -p 11433:1433 mcr.microsoft.com/mssql/server:2022-latest
node tools/fixture-ddl.mjs > /tmp/opus-edm.sql
docker cp /tmp/opus-edm.sql opus-edm-sql:/tmp/ && docker exec opus-edm-sql \
  /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P '<password>' -C -i /tmp/opus-edm.sql

# 2. the API, with the secret named rather than inlined
OPUS_SECRET_KV_EDM_SA='<password>' npm run api

# 3. the Studio, which proxies /api
npm run studio
```

Then **Catalog → Sources → Register a source**: host `localhost`, port `11433`, database `OpusEDM`,
SQL login `sa`, secret name `kv/edm/sa`, schemas `dq, master, processing, vendor`. Tick *Trust an
unverified certificate* — a development container's certificate is self-signed, the form will tell you
what accepting that means, and the registration records that you accepted it.

Secrets reach the process as `OPUS_SECRET_<REFERENCE>` in the environment, or as a file under
`SECRET_DIR`. A deployment with Key Vault or Secrets Manager replaces `resolveSecret` and nothing else,
because nothing else in the codebase knows what a password is.

---

## Verified

### Against SQL Server 2022 (CU26, 16.0.4265.3), through the API

| Checked | Result |
| --- | --- |
| Connection test | `mssql://localhost:11433/OpusEDM`, version reported |
| Scan | 12 objects — 11 tables, 1 view — no warnings, timestamped from `SYSUTCDATETIME()` |
| Inference | 10 entities, 2 blocked with their two different messages, 7 relationships |
| Fixture fidelity | **0 substantive differences** from the fixture scan; inferred draft identical |
| Determinism | two consecutive real scans byte-identical |
| Promotion | 10 entities, 96 attributes, 25 measures, 7 relationships merged into the published catalog; the 3 entities from another source carried through untouched |
| Projection | `dq.exception` visible to a caller holding `edm.dq.read`; the rest hidden behind derived entitlements; no physical name anywhere in the payload |
| Entitlement gate | an analyst persona gets 403 with the reason; the steward persona proceeds |
| Credential rule | the secret name and username never appear in the DOM or in any response |

### In the browser, both transports

| Checked | Result |
| --- | --- |
| Live banner | names the driver and says nothing is simulated |
| Fixture banner | says the backend is not running and how to start it; the Test button is absent, not answering about a connection nobody made |
| Register form | a connection string in the host field blocks; an unverified certificate warns and records; `../../etc/shadow` as a secret name blocks |
| Accepted risk | shown on the source detail afterwards, beside who accepted it |
| Publish | 10 of 10 published, 0 visible to this author, with the four derived capabilities named on one line |
| Drift | a re-scan with sampling on reports `master.PRODUCT.CATEGORY` as a new code list |
| Console | no errors on any path |

Gate: `npm run typecheck` (new — see below), metadata validation, 499 unit tests, all three apps build
with no budget warnings.

### The typecheck that was checking nothing

`tsc -p tsconfig.json --noEmit` compiled **zero files**: the root config is a solution file with
`"files": []` and two project references, so the command always passed. The apps and libraries were
genuinely checked by `ng build` and `ng test`, but `server/` was never type-checked at all — it runs
under `tsx`, which transpiles and does not check.

That was tolerable while the backend was four small files over local JSON. It stops being tolerable the
moment the backend opens connections to somebody's production database. `tsconfig.server.json` and
`npm run typecheck` now cover both halves, and the first run found two real defects:

- `problem(res, status, category, detail, code)` defaulted `code` to `category`, which gave it the
  closed category type by accident — so all six callers passing a real code (`notFound`,
  `providerFailed`, `fanOutExceeded`) were type errors nobody saw.
- the experience store declared its own copy of the provenance origin union and had lost `import`,
  `migration` and `copy` — so saving an imported definition stored an origin its own type said was
  impossible. `ProvenanceOrigin` is now named in `@opus/contracts` and derived from there.

### Known limitation, pre-existing

Below 900px the shell hides the nav rail (`chrome.scss`, from the CODA port), so every workspace behind
it — Catalog, and the EDM Page Builder — is unreachable on a phone. Not introduced here and not fixed
here: the rail needs a narrow-viewport affordance of its own, which affects every workspace.

---

## Next

1. **Synonyms and AI hints from the review.** `RawAttribute.synonyms` and `aiHints` are what make
   natural-language generation find a concept, and a steward reviewing ninety attributes is exactly
   the person who knows that "break" means `dq.exception`. The decision shape already carries
   `synonyms`; the screen does not yet offer it.
2. **Drift on a schedule.** Nothing yet re-scans on its own. A nightly scan that diffs and reports
   `breaking` changes is the difference between finding out from this screen and finding out from a
   page.
3. **Second dialect.** PostgreSQL, to prove the seam is where it claims to be.
4. **Integrated auth against a real domain.** `ntlm` and managed identity are wired and untested — this
   verification used a SQL login, which is the one mode with a secret to resolve.
5. **The Vocabulary tab in API mode.** It reads the catalog this browser hydrated at start-up; after an
   API promotion the server's projection is fetched into `PublishedCatalogService`, but the builder's
   own binding path still uses the locally-hydrated catalog and its fixture gateway. Moving the whole
   studio onto the server's projection is a data-path change beyond this work.
