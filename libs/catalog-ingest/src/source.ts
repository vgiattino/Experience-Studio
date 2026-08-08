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

/**
 * How the platform authenticates to a source.
 *
 * ── WHY `integrated` AND `ntlm` ARE TWO MODES AND NOT ONE ───────────────────────────────
 * They were one, and it did not work. `integrated` promised "the host's own identity, so there is no
 * secret in it" and was implemented as the `mssql` driver's NTLM option — but that option is not
 * integrated auth at all. It is NTLM with an *explicit* domain, username and password, and handing it
 * an empty options object throws before a socket is opened. The mode could never have connected on any
 * platform.
 *
 * The two are genuinely different and the difference is the credential:
 *
 *   · **`integrated`** is a trusted connection: the API process's own Windows token. Nothing is typed
 *     and nothing is stored. It needs the `msnodesqlv8` driver, because `tedious` — what `mssql` uses
 *     by default — has no SSPI support whatsoever.
 *   · **`ntlm`** is a domain account: `DOMAIN\user` and a password. That password is a secret and
 *     travels the same route as a SQL login's. It works on `tedious`, so it works wherever the API
 *     runs, which matters because the API is not always on Windows and the ODBC driver is not always
 *     installable on a locked-down one.
 *
 * Conflating them produced a mode that advertised no secret and then required three.
 */
export type AuthMode =
  /** A trusted connection — the API process's own Windows identity. No secret. Needs `msnodesqlv8`. */
  | 'integrated'
  /** A Windows domain account: `DOMAIN\user` plus a password. Works on the default driver. */
  | 'ntlm'
  /** SQL login: a username, and a password held either by this platform or by the deployment. */
  | 'sqlLogin'
  /** A managed identity resolved by the host. Also no secret in this process. */
  | 'managedIdentity';

/**
 * Which modes need a password, and therefore all of the credential machinery.
 *
 * A function rather than a comparison repeated at eight call sites, because it *was* repeated — as
 * `auth === 'sqlLogin'` — in the check, the edit check, the executor, the rotation route, the scan
 * guard and the screen. Adding a second credential-bearing mode to those by hand is how one of them
 * gets missed and a source silently becomes unscannable.
 */
export function needsCredential(auth: AuthMode): boolean {
  return auth === 'sqlLogin' || auth === 'ntlm';
}

/**
 * `DOMAIN\user`, split.
 *
 * The driver wants the domain as its own field. Nobody types it that way: Windows shows an account as
 * `GRESHAM\vincent.giattino` everywhere a person ever sees one, so that is what the form accepts and
 * this is where it becomes two values. Parsing rather than adding a `domain` field also means a
 * registration that switches between SQL and NTLM does not carry a field that means nothing in one of
 * them.
 */
export function splitWindowsLogin(username: string): { domain?: string; user: string } {
  const at = username.indexOf('\\');
  if (at < 0) return { user: username };
  return { domain: username.slice(0, at), user: username.slice(at + 1) };
}

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
  /** For `sqlLogin` and `ntlm`. The latter holds `DOMAIN\user`. */
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
  /**
   * Who last edited the registration, and when. Absent until somebody does.
   *
   * Kept alongside `registeredBy`/`registeredAt` rather than replacing them, because they answer
   * different questions — "who brought this database into the platform" and "who last changed where it
   * points" — and a screen that shows only the second cannot tell a reviewer that a source registered
   * against a development instance is now aimed at production.
   */
  updatedBy?: string;
  updatedAt?: string;
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
  /** Who last edited the registration, and when. Neither is a disclosure; both are provenance. */
  updatedBy?: string;
  updatedAt?: string;
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

  if (needsCredential(input.auth)) {
    if (!input.username?.trim()) {
      problems.push({
        field: 'username',
        message:
          input.auth === 'ntlm'
            ? 'A Windows domain login needs a username, as DOMAIN\\user.'
            : 'A SQL login needs a username.',
        severity: 'blocking',
      });
    } else if (input.auth === 'ntlm' && !splitWindowsLogin(input.username.trim()).domain) {
      /*
        The domain is required by the driver and cannot be guessed.

        Blocking rather than a warning because the alternative is a login attempt against a domain
        controller with a blank domain, and a run of those locks the account out — which is the most
        expensive failure this whole file exists to prevent.
      */
      problems.push({
        field: 'username',
        message:
          'A Windows domain login is DOMAIN\\user — the domain cannot be guessed, and attempts without it fail against the domain controller and count towards a lockout.',
        severity: 'blocking',
      });
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
          'This login needs a credential: type the password, or name a secret your deployment already holds.',
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
    updatedBy: source.updatedBy,
    updatedAt: source.updatedAt,
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

// ── editing a registration ──────────────────────────────────────────────────────────────

/**
 * What may be changed on a source after it is registered, and nothing else.
 *
 * ── WHY THIS IS A THIRD TYPE AND NOT `Partial<SourceRegistration>` ──────────────────────
 * Because the interesting part of an edit is what it *cannot* touch, and a partial of the stored type
 * says the opposite. Four fields are fixed for four different reasons:
 *
 *   · **`id`** names the record, and the promoted catalog's entities point at it by that name.
 *   · **`kind`** chooses the probe, the type mapping and the identifier quoting. A registration whose
 *     kind changed describes a database that was scanned by a different dialect's SQL, so the honest
 *     operation is to register the new one and retire this — not to relabel the old record.
 *   · **`registeredBy` / `registeredAt`** are the provenance an audit log is for. An edit adds
 *     `updatedBy`/`updatedAt` beside them rather than overwriting who brought the source in.
 *   · **`password`** is absent for the reason the file opens with. A credential travels on its own
 *     route, once, and a metadata edit is not that route — so this type has nowhere to put one and
 *     `applyEdit` has nothing to copy.
 */
export interface SourceEdit {
  name: string;
  host: string;
  port?: number;
  database: string;
  auth: AuthMode;
  username?: string;
  /**
   * The name of a secret the *deployment* holds. Blank leaves a managed secret alone.
   *
   * A secret this platform wrote is deliberately not editable here: it is changed by storing a new
   * password, which is a different act on a different route. Only a reference into somebody else's
   * store is a name, and only a name is metadata.
   */
  secretRef?: string;
  schemas: string[];
  encrypt: boolean;
  trustServerCertificate: boolean;
}

/**
 * The registration as an edit form needs it — for a caller already entitled to steward the catalog.
 *
 * ── WHY THIS IS NOT `redactForClient` ───────────────────────────────────────────────────
 * `redactForClient` answers "what may be said about this source", and its answer is deliberately
 * lossy: `host:port/database` collapsed into one string, no username, no secret name. That is right
 * for a roster. It is useless for an edit form, which cannot pre-fill a field it was never told the
 * value of — and a form that opens blank is a form that erases whatever the steward does not retype.
 *
 * So this is a second, narrower disclosure with its own name, and the name is the point. It is served
 * from one route, for one source at a time, to a caller holding `catalog.edit` — the same scoped
 * exception the review screen already runs under, for the same reason: the job cannot be done without
 * the values, and the values are metadata rather than secrets. `host` and `database` are already in
 * `target`. `username` is an account name. `secretRef` is the *name* of a secret and never its value,
 * and it is withheld anyway when the secret is one this platform manages, because then it is not a
 * thing the steward chose or can usefully change.
 */
export function editableView(source: SourceRegistration): SourceEdit & {
  kind: SourceKind;
  credential: SourceSummary['credential'];
} {
  const credential = credentialKind(source);
  return {
    name: source.name,
    kind: source.kind,
    host: source.host,
    port: source.port,
    database: source.database,
    auth: source.auth,
    username: source.username,
    // A managed secret's generated name is not offered for editing — see `SourceEdit.secretRef`.
    secretRef: credential === 'reference' ? source.secretRef : undefined,
    schemas: [...source.schemas],
    encrypt: source.encrypt,
    trustServerCertificate: source.trustServerCertificate,
    credential,
  };
}

/** One field that differs between the stored registration and what an edit would store. */
export interface FieldChange {
  field: keyof SourceEdit;
  /** Rendered for a person, not serialised — `schemas` as a list, `encrypt` as "clear text". */
  from: string;
  to: string;
  /**
   * True when the change means the next scan reads something the promoted baseline does not describe.
   *
   * See `materialChanges` for what follows from it. Not a severity: a material change is often exactly
   * what the steward intends, and the consequence is to the *baseline*, not to the edit.
   */
  material: boolean;
}

/**
 * Every comparable field, how to show it, and whether changing it invalidates the baseline.
 *
 * ── WHAT "MATERIAL" MEANS, AND WHY `secretRef` IS NOT ───────────────────────────────────
 * Drift is a diff against the schema that was promoted. A field is material when changing it means the
 * next scan reads a *different set of objects* — so the diff would attribute to the database a change
 * that was really made to the registration.
 *
 * `host`, `port` and `database` point somewhere else. `schemas` changes what is in scope. `auth` and
 * `username` change which login connects, and a scan sees only what its login has `VIEW DEFINITION` on
 * — a different account genuinely returns a different schema.
 *
 * `secretRef` is not material, and the distinction is worth stating because it looks like it should be.
 * It names *the password for the login in `username`*, not the login. Repointing it at a rotated secret
 * for the same account changes nothing the probe can see, and treating it as material would reset the
 * baseline every time a deployment rotated a credential in its own store — which is the one thing that
 * is supposed to be invisible here.
 *
 * `name`, `encrypt` and `trustServerCertificate` are not material either: the first is a label, and the
 * other two change how the connection is made rather than what it can read. They are not therefore
 * unimportant — both are warnings, and `applyEdit` re-derives `acknowledged` so a steward who turns
 * encryption off during an edit is recorded as having accepted that, exactly as at registration.
 */
const COMPARED_FIELDS: readonly {
  field: keyof SourceEdit;
  material: boolean;
  show: (source: SourceRegistration) => string;
}[] = [
  { field: 'name', material: false, show: (s) => s.name },
  { field: 'host', material: true, show: (s) => s.host },
  { field: 'port', material: true, show: (s) => (s.port === undefined ? '' : String(s.port)) },
  { field: 'database', material: true, show: (s) => s.database },
  { field: 'schemas', material: true, show: (s) => s.schemas.join(', ') },
  { field: 'auth', material: true, show: (s) => s.auth },
  { field: 'username', material: true, show: (s) => s.username ?? '' },
  { field: 'secretRef', material: false, show: (s) => s.secretRef ?? '' },
  { field: 'encrypt', material: false, show: (s) => (s.encrypt ? 'encrypted' : 'clear text') },
  {
    field: 'trustServerCertificate',
    material: false,
    show: (s) => (s.trustServerCertificate ? 'certificate unverified' : 'certificate verified'),
  },
];

/**
 * What actually differs between two registrations.
 *
 * Takes two *registrations* rather than a registration and an edit, so the comparison is against what
 * will really be stored: `applyEdit` trims, sorts the schemas, applies the default port and resolves
 * the credential, and a diff taken before all that reports changes that are not changes — a steward who
 * retyped `dq, vendor` as `vendor, dq` would be told they had altered the scan scope.
 */
export function changedFields(before: SourceRegistration, after: SourceRegistration): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const { field, material, show } of COMPARED_FIELDS) {
    const from = show(before);
    const to = show(after);
    if (from !== to) changes.push({ field, from, to, material });
  }
  return changes;
}

/** Only the changes that invalidate a promoted baseline. See `COMPARED_FIELDS`. */
export function materialChanges(changes: readonly FieldChange[]): FieldChange[] {
  return changes.filter((change) => change.material);
}

/**
 * The edit, cleaned exactly as `normalise` cleans a registration.
 *
 * Shared by `checkEdit` and `applyEdit` so the thing checked is the thing stored. Two functions each
 * trimming their own way is how a registration passes validation and then fails to connect.
 */
function cleanEdit(edit: SourceEdit, kind: SourceKind): Required<Pick<SourceEdit, 'name' | 'host' | 'database' | 'auth' | 'schemas' | 'encrypt' | 'trustServerCertificate'>> &
  Pick<SourceEdit, 'port' | 'username' | 'secretRef'> {
  const login = needsCredential(edit.auth);
  return {
    name: edit.name.trim(),
    host: edit.host.trim(),
    port: edit.port ?? DEFAULT_PORTS[kind],
    database: edit.database.trim(),
    auth: edit.auth,
    // Dropped outright when the source no longer uses a SQL login: a username belonging to no
    // authentication mode is a field that survives on the record and misleads the next reader.
    username: login ? edit.username?.trim() || undefined : undefined,
    secretRef: login ? edit.secretRef?.trim() || undefined : undefined,
    schemas: [...new Set(edit.schemas.map((schema) => schema.trim()))].sort(),
    encrypt: edit.encrypt,
    trustServerCertificate: edit.trustServerCertificate,
  };
}

/**
 * What checking an edit needs to know about the record being edited.
 *
 * ── WHY NOT JUST TAKE THE REGISTRATION ──────────────────────────────────────────────────
 * Because the browser runs this check as the steward types, and the browser does not have a
 * `SourceRegistration` — it has `editableView`, which withholds a managed secret's generated name on
 * purpose. Demanding the full record here would mean either shipping that name to the client for no
 * reason, or validating on the server only and finding out the edit was wrong after saving it.
 *
 * So the check asks for the three things it actually uses, and a `SourceRegistration` satisfies the
 * shape anyway — the server passes one directly and gets the identical answer.
 */
export interface EditContext {
  kind: SourceKind;
  /** How the credential is held today. `managed` survives an edit that names no reference. */
  credential: SourceSummary['credential'];
  registeredBy: string;
}

/** The context a stored registration presents. Used by `applyEdit`, and by the server directly. */
export function editContextOf(source: SourceRegistration): EditContext {
  return { kind: source.kind, credential: credentialKind(source), registeredBy: source.registeredBy };
}

/**
 * Which secret the edited registration ends up pointing at.
 *
 * Three cases, in the order they are decided:
 *
 *   1. **not a SQL login** — none. Whatever was there belonged to an authentication mode this source no
 *      longer uses, and the server deletes the managed secret rather than leaving a password on disk
 *      belonging to nothing (the same reasoning as deleting a source).
 *   2. **a reference was typed** — that. The steward is naming a secret their deployment holds.
 *   3. **nothing was typed** — keep a *managed* secret, drop a reference. Keeping the managed one is
 *      what makes an edit to the host or the schemas not also a credential change; dropping the
 *      reference is what makes clearing that field mean something, since it is the one the form shows.
 */
function resolveSecretRef(
  current: SourceRegistration,
  cleaned: ReturnType<typeof cleanEdit>,
): string | undefined {
  if (!needsCredential(cleaned.auth)) return undefined;
  if (cleaned.secretRef) return cleaned.secretRef;
  return current.secretRef?.startsWith(MANAGED_SECRET_PREFIX) ? current.secretRef : undefined;
}

/**
 * Will the edited source have a credential at all?
 *
 * The same three cases as `resolveSecretRef`, decided without the secret's name — which is exactly what
 * the browser can answer and what the check needs. The two are kept adjacent so a change to one is
 * visibly a change to the other.
 */
function willHaveCredential(context: EditContext, cleaned: ReturnType<typeof cleanEdit>): boolean {
  if (!needsCredential(cleaned.auth)) return false;
  return !!cleaned.secretRef || context.credential === 'managed';
}

/**
 * Check an edit the way `checkRegistration` checks a registration, with one deliberate difference.
 *
 * Everything about the shape of the fields is the same rule and is therefore the same code — a second
 * host validator would drift from the first, and the first is the one the server runs on registration.
 *
 * The difference is the credential. `checkRegistration` refuses a SQL login with neither a password nor
 * a secret, because registering one would create a source that cannot be used. On an edit that refusal
 * would be a trap: switching from integrated auth to a SQL login is a legitimate edit, the password is
 * set on a different route, and a *blocking* problem here would mean the steward can never reach that
 * route — the form would refuse to save the state the credential screen exists to complete.
 *
 * So it is a warning instead. The edit saves, `credential` becomes `none`, Scan is already blocked with
 * a sentence saying why, and the acceptance is recorded in `acknowledged` like every other warning.
 */
export function checkEdit(context: EditContext, edit: SourceEdit): RegistrationProblem[] {
  const cleaned = cleanEdit(edit, context.kind);
  const credentialHeld = willHaveCredential(context, cleaned);

  const problems = checkRegistration({
    ...cleaned,
    kind: context.kind,
    /*
      A stand-in for the credential rule, not the real reference.

      `checkRegistration` wants to see *a* credential for a SQL login, and a kept managed secret is one —
      but its name is deliberately not available here. `MANAGED_SECRET_PREFIX` is a valid reference by
      construction, so it satisfies the shape check without inventing a name that could be mistaken for
      a real one. Nothing is stored from this object; `applyEdit` resolves the true reference separately.
    */
    secretRef: cleaned.secretRef ?? (credentialHeld ? MANAGED_SECRET_PREFIX : undefined),
    registeredBy: context.registeredBy,
  }).filter(
    // Replaced below with the warning this function's comment explains.
    (problem) => !(problem.field === 'password' && needsCredential(cleaned.auth) && !credentialHeld),
  );

  if (needsCredential(cleaned.auth) && !credentialHeld) {
    problems.push({
      field: 'secretRef',
      message:
        'This source will have no credential, so scanning stays blocked until one is set. Either name a secret your deployment holds, or save this and then use “Set a password”.',
      severity: 'warning',
    });
  }

  return problems;
}

/**
 * The edited registration: cleaned, credential resolved, provenance extended, read-only re-asserted.
 *
 * Built field by field for the same reason `normalise` is — a spread would carry across whatever gets
 * added to `SourceRegistration` next, and the field most likely to be added to that type is another
 * credential. `id`, `kind`, `registeredBy` and `registeredAt` are copied from the current record rather
 * than taken from the edit, because `SourceEdit` has no way to express them and that is the mechanism.
 */
export function applyEdit(
  current: SourceRegistration,
  edit: SourceEdit,
  now: string,
  updatedBy: string,
): SourceRegistration {
  const cleaned = cleanEdit(edit, current.kind);

  return {
    id: current.id,
    name: cleaned.name,
    kind: current.kind,
    host: cleaned.host,
    port: cleaned.port,
    database: cleaned.database,
    auth: cleaned.auth,
    username: cleaned.username,
    secretRef: resolveSecretRef(current, cleaned),
    schemas: cleaned.schemas,
    encrypt: cleaned.encrypt,
    trustServerCertificate: cleaned.trustServerCertificate,
    readOnly: true,
    /*
      Re-derived from the edit, not carried over.

      Carrying the old list forward would record an acknowledgement of a risk that may no longer exist —
      a source that had certificate checking turned back on would still read as "trustServerCertificate
      accepted by whoever registered it". Derived, the list is always what is true of the stored record.
    */
    acknowledged: checkEdit(editContextOf(current), edit)
      .filter((problem) => problem.severity === 'warning')
      .map((problem) => problem.field),
    registeredBy: current.registeredBy,
    registeredAt: current.registeredAt,
    updatedBy,
    updatedAt: now,
  };
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
