/**
 * A registered data source, and what may be said about it in the browser.
 *
 * ── THE RULE THIS FILE EXISTS TO ENFORCE, AND ITS ONE PERMITTED DIRECTION ────────────────
 * **A credential never reaches the client, and is never stored on a registration.** A registration is
 * split in two: the part that describes the source — its kind, host, database, which schemas to scan —
 * and the part that authenticates to it. The first is metadata a steward reviews and an audit log
 * records. The second is a *reference* to a secret the server resolves.
 *
 * A password may travel in exactly one direction, once: from the steward's browser to the server, over
 * TLS, at the moment they register or rotate it. That is how every database tool works and there is no
 * way around it — somebody has to type the password somewhere. What must never happen is the return
 * journey, or the persistence:
 *
 *   · **server → browser: never.** `redactForClient` is the only function that produces the shape a UI
 *     receives, and it is deliberately not the identity function even though the type would allow it.
 *   · **stored on the registration: never.** The server writes the password into its own secret store
 *     under a generated name and keeps only that name. `SourceRegistration` has no password field, and
 *     `normalise` builds its result field by field so a future field cannot be carried across by
 *     accident.
 *
 * The two shapes are therefore different types, and that separation is the mechanism rather than a
 * convention: `SourceRegistrationInput` is what a steward submits and may carry a password;
 * `SourceRegistration` is what exists afterwards and cannot.
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
  /** SQL login: a username, and a password held either by this platform or by the deployment. */
  | 'sqlLogin'
  /** A managed identity resolved by the host. Also no secret in this process. */
  | 'managedIdentity';

/**
 * What a steward submits. May carry a credential; is never what gets stored.
 *
 * `secretRef` and `password` are alternatives, and exactly one is expected for a SQL login:
 *
 *   · **`secretRef`** — the deployment already holds the password in its own store (Key Vault, Secrets
 *     Manager, a mounted file) and the platform is told its name. Nothing sensitive crosses the wire.
 *   · **`password`** — the steward types it. It crosses once, over TLS, and the server puts it in its
 *     secret store under a name it generates. This is the ordinary path for somebody registering a
 *     database they have credentials for and no vault to put them in first.
 */
export interface SourceRegistrationInput {
  name: string;
  kind: SourceKind;
  host: string;
  port?: number;
  database: string;
  auth: AuthMode;
  username?: string;
  /** The name of a secret the deployment already holds. Mutually exclusive with `password`. */
  secretRef?: string;
  /**
   * The password itself, typed by the steward.
   *
   * The only field in this codebase that may hold one, and it exists on the *input* type alone. It is
   * read by the server, written to the secret store, and dropped: `normalise` cannot copy it because
   * `SourceRegistration` has nowhere to put it.
   */
  password?: string;
  schemas: string[];
  encrypt: boolean;
  trustServerCertificate: boolean;
  registeredBy: string;
}

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
  /**
   * How the credential is held — never what it is.
   *
   * The client needs this to offer the right action: a `managed` password can be rotated in place, a
   * `reference` is changed in the deployment's own store, and `none` is integrated or managed-identity
   * auth with no secret to rotate at all. Saying which is not a disclosure; saying the name of a secret
   * a caller has no need for would be, so `secretRef` still does not cross.
   */
  credential: 'none' | 'managed' | 'reference';
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
export function checkRegistration(input: SourceRegistrationInput): RegistrationProblem[] {
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
    /*
      Exactly one of the two ways to supply a credential.

      Both are legitimate and they are not interchangeable, so "either" is not the same as "both". A
      registration carrying a password *and* the name of a secret is ambiguous about which one is
      authoritative, and the wrong answer is a login failure against a production account — which locks
      it out. Refusing the ambiguity is cheaper than guessing.
    */
    const reference = input.secretRef?.trim();
    const typed = input.password ?? '';

    if (reference && typed) {
      problems.push({
        field: 'password',
        message:
          'Give a password or the name of a secret, not both. Two credentials with no rule about which wins is a login failure against the account you are least able to afford one on.',
        severity: 'blocking',
      });
    } else if (reference) {
      const checked = checkSecretRef(reference);
      if (!checked.ok) {
        problems.push({ field: 'secretRef', message: checked.reason, severity: 'blocking' });
      }
    } else if (typed) {
      /*
        Only two checks, and neither is a strength rule.

        The password belongs to somebody else's account under somebody else's policy; a platform that
        refuses it for not having a symbol in it is a platform that cannot connect to a database that
        works. What *is* worth catching is a value that cannot possibly be right: empty, or padded with
        whitespace that a copy-and-paste added and the server will not strip for you.
      */
      if (!typed.trim()) {
        problems.push({ field: 'password', message: 'The password is blank.', severity: 'blocking' });
      } else if (typed !== typed.trim()) {
        problems.push({
          field: 'password',
          message:
            'The password starts or ends with a space. That is legal, so it is not corrected silently — remove it if it was a copy-and-paste artefact.',
          severity: 'warning',
        });
      }
    } else {
      problems.push({
        field: 'password',
        message:
          'A SQL login needs a credential: type the password, or name a secret your deployment already holds.',
        severity: 'blocking',
      });
    }
  }

  /*
    A password pasted into a field that is not for one.

    `password` is skipped, obviously — it is the one field that may hold a credential. The scan looks
    for a `password=` fragment rather than for anything secret-looking, because that fragment is the
    signature of the mistake this catches: a whole connection string pasted into the host or the name.
  */
  for (const [field, value] of Object.entries(input)) {
    if (field === 'password' || typeof value !== 'string') continue;
    if (/\b(password|pwd)\s*=/i.test(value)) {
      problems.push({
        field,
        message:
          'That looks like a connection string with a password in it. Put the host here, and the password in the password field.',
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

/**
 * The registration as stored: defaults applied, whitespace gone, read-only asserted, credential gone.
 *
 * `managedSecretRef` is where the server put a password the steward typed. Passing it is what turns a
 * submitted credential into a stored *reference* — and there is no path by which `input.password`
 * reaches the result, because the result is built field by field and has nowhere to put one.
 */
export function normalise(
  input: SourceRegistrationInput,
  id: string,
  now: string,
  managedSecretRef?: string,
): SourceRegistration {
  const cleaned = {
    name: input.name.trim(),
    kind: input.kind,
    host: input.host.trim(),
    port: input.port ?? DEFAULT_PORTS[input.kind],
    database: input.database.trim(),
    auth: input.auth,
    username: input.username?.trim() || undefined,
    secretRef: managedSecretRef?.trim() || input.secretRef?.trim() || undefined,
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
    acknowledged: checkRegistration({ ...cleaned, password: input.password })
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
    credential: credentialKind(source),
  };
}

/**
 * Which of the three the stored reference is, from its shape.
 *
 * A managed secret is one this platform wrote, and it is recognisable because this platform is what
 * named it — `MANAGED_SECRET_PREFIX`. Anything else came from the deployment's own store and is theirs
 * to rotate. Derived rather than stored as a fourth field, so the two cannot disagree.
 */
function credentialKind(source: SourceRegistration): SourceSummary['credential'] {
  if (!source.secretRef) return 'none';
  return source.secretRef.startsWith(MANAGED_SECRET_PREFIX) ? 'managed' : 'reference';
}

/**
 * The prefix on every secret this platform writes for itself.
 *
 * A namespace, so a managed secret can never collide with one a deployment created, and so
 * `credentialKind` can tell them apart without a flag that could drift out of step with the reference.
 */
export const MANAGED_SECRET_PREFIX = 'opus/sources/';

/** Where a source's own password lives, when the steward typed one. */
export function managedSecretRefFor(sourceId: string): string {
  return `${MANAGED_SECRET_PREFIX}${sourceId}/password`;
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
