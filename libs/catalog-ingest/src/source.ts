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
  /**
   * The warnings the registering steward accepted, by field.
   *
   * A risk somebody chose to run is worth more than a risk nobody was told about, and the difference
   * between them is a record. Six months later "why is production registered with certificate checking
   * off" has an answer: this list, next to who registered it and when.
   */
  acknowledged: string[];
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
  /** Warnings accepted at registration, so the detail view can show what was waved through. */
  acknowledged: string[];
}

export interface RegistrationProblem {
  field: string;
  message: string;
  /**
   * `blocking` cannot be registered. `warning` can, once a steward has read it.
   *
   * ── WHY THIS DISTINCTION EXISTS ─────────────────────────────────────────────────────────
   * Because without it the check contradicted itself. Trusting an unverified certificate was refused
   * outright, with a message that read "acceptable against a development instance, never against one
   * holding real data" — which describes a judgement, and then took it away. The result was that a
   * development SQL Server with a self-signed certificate, which is what every deployment starts
   * against, could not be registered at all.
   *
   * A malformed host is blocking: there is nothing to accept, the registration is simply wrong. An
   * unverified certificate is a risk somebody with authority may decide to run, and the useful thing
   * to do about it is to make them read it and then record that they did — which is what
   * `acknowledged` on the registration is for.
   */
  severity: 'blocking' | 'warning';
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
  input: Omit<SourceRegistration, 'id' | 'registeredAt' | 'readOnly' | 'acknowledged'>,
): RegistrationProblem[] {
  const problems: RegistrationProblem[] = [];

  if (!input.name.trim()) problems.push({ field: 'name', message: 'Give the source a name.', severity: 'blocking' });

  if (!SOURCE_KINDS.includes(input.kind)) {
    problems.push({
      field: 'kind',
      message: `"${input.kind}" is not a source kind this platform knows.`,
      severity: 'blocking',
    });
  }

  if (!input.host.trim()) {
    problems.push({ field: 'host', message: 'A host is required.', severity: 'blocking' });
  } else if (!HOST_PATTERN.test(input.host.trim())) {
    problems.push({
      field: 'host',
      message:
        'That is not a host name. A host is a name, an address, or HOST\\INSTANCE — never a connection string, and never anything containing ";" or "=".',
      severity: 'blocking',
    });
  }

  if (input.port !== undefined && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) {
    problems.push({ field: 'port', message: 'A port is a whole number between 1 and 65535.', severity: 'blocking' });
  }

  if (!IDENTIFIER_PATTERN.test(input.database.trim())) {
    problems.push({
      field: 'database',
      message: 'A database name must be a plain identifier — letters, digits and underscores.',
      severity: 'blocking',
    });
  }

  for (const schema of input.schemas) {
    if (!IDENTIFIER_PATTERN.test(schema)) {
      problems.push({
        field: 'schemas',
        message: `"${schema}" is not a valid schema name.`,
        severity: 'blocking',
      });
    }
  }
  if (!input.schemas.length) {
    problems.push({
      field: 'schemas',
      message:
        'Name at least one schema. Scanning everything a login can see finds system catalogs and other applications’ tables, and a steward then has to reject them one at a time.',
      severity: 'blocking',
    });
  }

  if (input.auth === 'sqlLogin') {
    if (!input.username?.trim()) {
      problems.push({ field: 'username', message: 'A SQL login needs a username.', severity: 'blocking' });
    }
    const reference = input.secretRef?.trim();
    if (reference) {
      const checked = checkSecretRef(reference);
      if (!checked.ok) {
        problems.push({ field: 'secretRef', message: checked.reason, severity: 'blocking' });
      }
    }
    if (!reference) {
      problems.push({
        field: 'secretRef',
        message:
          'Name the secret holding the password. This platform stores a reference, never the password itself.',
        severity: 'blocking',
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
        severity: 'blocking',
      });
    }
  }

  if (!input.encrypt) {
    problems.push({
      field: 'encrypt',
      message:
        'Encryption is off, so credentials and rows cross the network in clear text. Acceptable only on a network you control end to end.',
      severity: 'warning',
    });
  }
  if (input.trustServerCertificate) {
    problems.push({
      field: 'trustServerCertificate',
      message:
        'Trusting an unverified certificate defeats the encryption above it. Acceptable against a development instance, never against one holding real data.',
      severity: 'warning',
    });
  }

  return problems;
}

/** The registration as stored: defaults applied, whitespace gone, read-only asserted. */
export function normalise(
  input: Omit<SourceRegistration, 'id' | 'registeredAt' | 'readOnly' | 'acknowledged'>,
  id: string,
  now: string,
): SourceRegistration {
  const cleaned = {
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
    registeredBy: input.registeredBy,
  };

  return {
    id,
    ...cleaned,
    readOnly: true,
    /*
      The warnings this registration carries, derived from the check rather than taken from the caller.

      Derived, so the list is what is actually true of the stored record: a caller cannot claim to have
      acknowledged something that is not a warning, and cannot omit one that is. Six months later, "why
      is production registered with certificate checking off" has an answer — this list, beside who
      registered it and when.
    */
    acknowledged: checkRegistration(cleaned)
      .filter((problem) => problem.severity === 'warning')
      .map((problem) => problem.field),
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
    acknowledged: [...source.acknowledged],
  };
}

/**
 * A secret *reference* is a name, not a path expression.
 *
 * ── WHY THIS LIVES HERE AND NOT BESIDE THE FILE READ ────────────────────────────────────
 * Because it is a rule about what a registration may contain, and the registration is this file's
 * subject. Keeping it here also makes it testable: the code that resolves a reference to a secret is
 * necessarily bound to a filesystem and an environment, and a check buried in it would be a check
 * nothing exercised — which is a poor place for the only thing standing between `secretRef` and a
 * `readFile` of `../../etc/shadow`.
 *
 * Letters, digits, and the three separators a secret store actually uses in its own naming:
 * `kv/edm/reader`, `edm-scanner`, `opus.edm.prod`. Everything that composes a traversal is absent, and
 * a leading separator is refused so a reference cannot be an absolute path.
 */
const SECRET_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

export function checkSecretRef(reference: string): { ok: true } | { ok: false; reason: string } {
  if (!SECRET_REFERENCE_PATTERN.test(reference)) {
    return {
      ok: false,
      reason: `"${reference}" is not a secret name. A name is letters, digits, and the separators "._/-" — never a path.`,
    };
  }
  // Belt and braces: the pattern admits `/` and a dot, so `a/../b` matches it and is still a traversal.
  if (reference.split('/').includes('..')) {
    return { ok: false, reason: `"${reference}" contains a path segment. A secret name is not a path.` };
  }
  return { ok: true };
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

/** Only the problems that stop a registration. Warnings are for a steward to read and accept. */
export function blockingProblems(problems: readonly RegistrationProblem[]): RegistrationProblem[] {
  return problems.filter((problem) => problem.severity === 'blocking');
}
