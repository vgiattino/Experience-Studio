/**
 * @opus/catalog-ingest — how a database becomes a governed catalog.
 *
 * Five steps, each with its own artifact, because each is a different kind of thing and collapsing them
 * is what makes an ingestion pipeline unreviewable:
 *
 *   1. **register** (`source.ts`) — a source described in metadata, its credential held by reference.
 *   2. **scan** (`mssql-probe.ts` over the `SqlExecutor` port) — what the database says about itself.
 *   3. **infer** (`infer.ts`) — a *draft* catalog in which every decision carries its reason.
 *   4. **review and promote** (`promote.ts`) — a steward's decisions merged into the catalog.
 *   5. **re-scan and diff** (`drift.ts`) — what changed, and which pages it breaks.
 *
 * The library depends on no database driver and no UI framework: a deployment supplies a `SqlExecutor`,
 * and `fixture-source.ts` supplies one offline so every step is exercised without a server.
 */

export {
  IMPLEMENTED_KINDS,
  MANAGED_SECRET_PREFIX,
  SOURCE_KINDS,
  blockingProblems,
  checkRegistration,
  checkSecretRef,
  managedSecretRefFor,
  normalise,
  quoteIdentifier,
  redactForClient,
  type AuthMode,
  type RegistrationProblem,
  type SourceKind,
  type SourceRegistration,
  type SourceRegistrationInput,
  type SourceSummary,
} from './source';

export {
  DEFAULT_PROBE_OPTIONS,
  type PhysicalColumn,
  type PhysicalForeignKey,
  type PhysicalSchema,
  type PhysicalTable,
  type ProbeOptions,
  type SchemaProbe,
  type SqlExecutor,
  type SqlRow,
} from './physical';

export {
  MsSqlProbe,
  SQL_CHECKS,
  SQL_COLUMNS,
  SQL_FOREIGN_KEYS,
  SQL_PRIMARY_KEYS,
  SQL_TABLES,
  SQL_VERSION,
  declaredLength,
  enumerationSql,
  parseCheckValues,
} from './mssql-probe';

export {
  isCodeSemantic,
  looksPersonal,
  mapType,
  semanticTypeFor,
  type TypeDecision,
} from './type-map';

export {
  DEFAULT_INFER_OPTIONS,
  infer,
  kebab,
  pluralise,
  singular,
  titleise,
  words,
  type CatalogDraft,
  type Confidence,
  type Decision,
  type DraftAttribute,
  type DraftEntity,
  type DraftMeasure,
  type DraftProblem,
  type DraftRelationship,
  type InferOptions,
} from './infer';

export {
  defaultDecisions,
  promote,
  type AttributeDecision,
  type EntityDecision,
  type MeasureDecision,
  type PromotionNote,
  type PromotionResult,
  type StewardDecisions,
} from './promote';

export {
  detectDrift,
  type DriftChange,
  type DriftKind,
  type DriftReport,
  type DriftSeverity,
} from './drift';

export {
  FIXTURE_SCHEMAS,
  FixtureExecutor,
  OPUS_EDM_FIXTURE,
  type FixtureColumn,
  type FixtureDatabase,
  type FixtureForeignKey,
  type FixtureOptions,
  type FixtureTable,
} from './fixture-source';
