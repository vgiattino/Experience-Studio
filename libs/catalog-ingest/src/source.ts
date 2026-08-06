/**
 * A registered data source, and what may be said about it in the browser.
 *
 * ── THE ONE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────────────────
 * **A credential never reaches the client.** A registration is split in two: the part that describes
 * the source — its kind, host, database, which schemas to scan — and the part that authenticates to it.
 * The first is metadata a steward reviews and an audit log records. The second is a reference to a
 * secret the server resolves, and it is not optional to keep them apart: a connection string with a
 * password in it, sent to a browser once, is a password in a browser's memory, in its devtools, and in
 * every error report it ever uploads.
 *
 * So `SourceRegistration` carries `secretRef` — the *name* of a secret in the deployment's store — and
 * never a password. `redactForClient` is the only function that produces the shape a UI receives, and
 * it is deliberately not the identity function even though the type would allow it.
 *
 * ── AND WHY MS SQL SERVER IS A KIND, NOT AN ASSUMPTION ──────────────────────────────────
 * `kind` exists from the first driver rather than after the second. The introspection SQL, the type
 * mapping and the identifier quoting are all dialect-specific, and a design that hardcodes one dialect
 * has to be unpicked to add another. One enum member today; the seam is the point.
 */

/** Source kinds this platform can scan. Only `mssql` has a probe today; the rest are declared. */
export type SourceKind = 'mssql' | 'postgres' | 'oracle' | 'snowflake' | 'databricks';

export const SOURCE_KINDS: readonly SourceKind[] = [
  'mssql',
  'postgres',
  'oracle',
  'snowflake',
  'databricks',
];

/** Which kinds can actually be scanned today. Anything else registers and reports "no probe". */
export const IMPLEMENTED_KINDS: readonly SourceKind[] = ['mssql'];

export type AuthMode =
  /** Windows / Entra integrated auth. No secret to hold, which is the reason to prefer it. */
  | 'integrated'
  /** SQL login. `secretRef` names the password in the deployment's secret store. */
  | 'sqlLogin'
  /** A managed identity resolved by the host. Also no secret in this process. */
  | 'managedIdentity';

export interface SourceRegistration {
  id: string;
  /** What a steward calls it. "Opus EDM — production", not a host name. */
  name: string;
  kind: SourceKind;
  host: string;
  port?: number;
  database: string;
  auth: AuthMode;
  /** For `sqlLogin`. */
  username?: string;
  /**
   * The *name* of a secret in the deployment's store — never the secret.
   *
   * Held as a reference so this record can be logged, diffed, exported and shown to a reviewer without
   * any of those becoming a disclosure.
   */
  secretRef?: string;
  /** Schemas to scan. Empty means every schema the login can see, which is rarely what anyone wants. */
  schemas: string[];
  /** Encrypt the transport. Default true; a deployment that turns it off has to say so out loud. */
  encrypt: boolean;
  /**
   * Trust a certificate the platform cannot verify.
   *
   * Separate from `encrypt` because they are different decisions and conflating them is how a
   * self-signed development certificate ends up trusted in production.
   */
  trustServerCertificate: boolean;
  /** Read-only is not a suggestion: the scanner issues SELECT only, and this records the intent. */
  readOnly: true;
  registeredBy: string;
  registeredAt: string;
}

/** The client's view. No `secretRef`, no username, no host detail beyond what a reviewer needs. */
export interface SourceSummary {
  id: string;
  name: string;
  kind: SourceKind;
  /** `host:port/database`, which is enough to tell two registrations apart and no more. */
  target: string;
  auth: AuthMode;
  schemas: string[];
  encrypt: boolean;
  trustServerCertificate: boolean;
  registeredBy: string;
  registeredAt: string;
  /** True when this platform has a probe for the kind. */
  scannable: boolean;
}

export interface RegistrationProblem {
  field: string;
  message: string;
}

/** Default ports, so a steward who leaves it blank gets the right one rather than a failure. */
const DEFAULT_PORTS: Record<SourceKind, number> = {
  mssql: 1433,
  postgres: 5432,
  oracle: 1521,
  snowflake: 443,
  databricks: 443,
};

/**
 * A host that is a host, not a connection string.
 *
 * Rejecting `;` and `=` matters more than it looks: a "host" of
 * `db;Initial Catalog=other;Integrated Security=true` is a connection-string injection, and the driver
 * would honour it. The allowlist is hostnames, IPv4, and SQL Server's `HOST\\INSTANCE` form.
 */
const HOST_PATTERN = /^[A-Za-z0-9._-]+(\\[A-Za-z0-9._-]+)?$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$#@]{0,127}$/;

/**
 * Check a registration before anything is stored or connected.
 *
 * Every rule here is a way a registration can be wrong in a way that is expensive later: a credential
 * pasted into the host field, a scan of every schema on a shared server, a production database
 * registered with certificate checking off.
 */
export function checkRegistration(
  input: Omit<SourceRegistration, 'id' | 'registeredAt' | 'readOnly'>,
): RegistrationProblem[] {
  const problems: RegistrationProblem[] = [];

  if (!input.name.trim()) problems.push({ field: 'name', message: 'Give the source a name.' });

  if (!SOURCE_KINDS.includes(input.kind)) {
    problems.push({ field: 'kind', message: `"${input.kind}" is not a source kind this platform knows.` });
  }

  if (!input.host.trim()) {
    problems.push({ field: 'host', message: 'A host is required.' });
  } else if (!HOST_PATTERN.test(input.host.trim())) {
    problems.push({
      field: 'host',
      message:
        'That is not a host name. A host is a name, an address, or HOST\\INSTANCE — never a connection string, and never anything containing ";" or "=".',
    });
  }

  if (input.port !== undefined && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) {
    problems.push({ field: 'port', message: 'A port is a whole number between 1 and 65535.' });
  }

  if (!IDENTIFIER_PATTERN.test(input.database.trim())) {
    problems.push({
      field: 'database',
      message: 'A database name must be a plain identifier — letters, digits and underscores.',
    });
  }

  for (const schema of input.schemas) {
    if (!IDENTIFIER_PATTERN.test(schema)) {
      problems.push({ field: 'schemas', message: `"${schema}" is not a valid schema name.` });
    }
  }
  if (!input.schemas.length) {
    problems.push({
      field: 'schemas',
      message:
        'Name at least one schema. Scanning everything a login can see finds system catalogs and other applications’ tables, and a steward then has to reject them one at a time.',
    });
  }

  if (input.auth === 'sqlLogin') {
    if (!input.username?.trim()) {
      problems.push({ field: 'username', message: 'A SQL login needs a username.' });
    }
    if (!input.secretRef?.trim()) {
      problems.push({
        field: 'secretRef',
        message:
          'Name the secret holding the password. This platform stores a reference, never the password itself.',
      });
    }
  }

  // A password in any field, however it got there.
  for (const [field, value] of Object.entries(input)) {
    if (typeof value !== 'string') continue;
    if (/\b(password|pwd)\s*=/i.test(value)) {
      problems.push({
        field,
        message: 'That looks like a password. Store it in your secret store and register its name here.',
      });
    }
  }

  if (!input.encrypt) {
    problems.push({
      field: 'encrypt',
      message: 'Encryption off means credentials and rows cross the network in clear text.',
    });
  }
  if (input.trustServerCertificate) {
    problems.push({
      field: 'trustServerCertificate',
      message:
        'Trusting an unverified certificate defeats the encryption above it. Acceptable against a development instance, never against one holding real data.',
    });
  }

  return problems;
}

/** The registration as stored: defaults applied, whitespace gone, read-only asserted. */
export function normalise(
  input: Omit<SourceRegistration, 'id' | 'registeredAt' | 'readOnly'>,
  id: string,
  now: string,
): SourceRegistration {
  return {
    id,
    name: input.name.trim(),
    kind: input.kind,
    host: input.host.trim(),
    port: input.port ?? DEFAULT_PORTS[input.kind],
    database: input.database.trim(),
    auth: input.auth,
    username: input.username?.trim() || undefined,
    secretRef: input.secretRef?.trim() || undefined,
    schemas: [...new Set(input.schemas.map((schema) => schema.trim()))].sort(),
    encrypt: input.encrypt,
    trustServerCertificate: input.trustServerCertificate,
    readOnly: true,
    registeredBy: input.registeredBy,
    registeredAt: now,
  };
}

/**
 * The only shape a client may receive.
 *
 * Explicit field by field rather than a spread with deletions: a spread that forgets a new field ships
 * it, and the field most likely to be added to this type later is another credential.
 */
export function redactForClient(source: SourceRegistration): SourceSummary {
  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    target: `${source.host}${source.port ? `:${source.port}` : ''}/${source.database}`,
    auth: source.auth,
    schemas: [...source.schemas],
    encrypt: source.encrypt,
    trustServerCertificate: source.trustServerCertificate,
    registeredBy: source.registeredBy,
    registeredAt: source.registeredAt,
    scannable: IMPLEMENTED_KINDS.includes(source.kind),
  };
}

/**
 * Quote an identifier for SQL Server, having first checked it is one.
 *
 * The scanner mostly uses parameters, but three things cannot be parameterised in any dialect: a schema
 * name, a table name and a column name. Those are interpolated, so they are validated against
 * `IDENTIFIER_PATTERN` first and *then* bracket-quoted with `]` doubled. Validate-then-quote rather than
 * either alone: quoting a string that was never an identifier still executes, and validating without
 * quoting breaks on a legal-but-reserved name like `[order]`.
 */
export function quoteIdentifier(name: string): string {
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw new Error(`Refusing to build SQL around "${name}": that is not an identifier.`);
  }
  return `[${name.replace(/]/g, ']]')}]`;
}
