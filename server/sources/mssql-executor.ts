/**
 * The real `SqlExecutor`: `@opus/catalog-ingest`'s port, over the `mssql` driver.
 *
 * ── THIS IS THE WHOLE ADAPTER ───────────────────────────────────────────────────────────
 * Everything above the port — the introspection SQL, the type mapping, the inference, the review, the
 * promotion, the drift diff — is dialect logic that lives in the library and has no idea a driver
 * exists. This file is the part that knows about TDS, and it is deliberately small: a pool, a query,
 * and the four decisions that a connection to somebody's production database deserves to have made
 * explicitly.
 *
 * ── THE FOUR DECISIONS ──────────────────────────────────────────────────────────────────
 *   1. **Read-only intent, and a read-only login.** `readOnlyIntent` routes to a secondary replica
 *      where one exists, which is where a schema scan belongs — the scan is not urgent and the
 *      primary is serving the business. It is a hint, not a guarantee, so the real protection is the
 *      login: `db_datareader` plus `VIEW DEFINITION`, which is exactly what a scan needs and nothing
 *      that can write. `tools/fixture-ddl.mjs` emits those four grants for a DBA to read.
 *   2. **Bounded time.** A connection that hangs and a statement that hangs are different failures
 *      with the same symptom, so both are bounded and the message says which happened. Without this a
 *      scan of an unreachable host is a spinner nobody can explain.
 *   3. **The credential is resolved here and nowhere else.** It arrives as the *name* of a secret,
 *      is read once, is passed to the driver, and is never stored on this object, logged, or included
 *      in an error. `label` is `mssql://host/database` — enough to identify a connection in an audit
 *      trail, and not a connection string.
 *   4. **Pools are cached per source and closed on demand.** Opening a pool per scan leaks sockets in
 *      a long-lived process; sharing one forever holds a connection to a database somebody may be
 *      trying to take offline.
 */

import sql from 'mssql';
import { splitWindowsLogin, type SourceRegistration, type SqlExecutor, type SqlRow } from '@opus/catalog-ingest';

import { resolveSecret } from './secrets';

/** How long to wait for a connection, and for a statement. Both bounded, separately. */
const CONNECT_TIMEOUT_MS = Number(process.env['SCAN_CONNECT_TIMEOUT_MS'] ?? 10_000);
const REQUEST_TIMEOUT_MS = Number(process.env['SCAN_REQUEST_TIMEOUT_MS'] ?? 60_000);

/**
 * The ODBC driver a trusted connection goes through.
 *
 * Named here rather than left to the driver's own default, which is `SQL Server Native Client 11.0` on
 * Windows — deprecated since 2011 and absent from any machine set up this decade. Taking that default
 * produces `IM002: data source name not found`, which reads as a configuration mistake and is really a
 * driver nobody has installed.
 */
const ODBC_DRIVER = process.env['OPUS_ODBC_DRIVER'] ?? 'ODBC Driver 18 for SQL Server';

const pools = new Map<string, sql.ConnectionPool>();

/**
 * Build the driver config from a registration.
 *
 * Every field is copied deliberately. A spread of the registration would put `secretRef` and
 * `registeredBy` into a driver config, where they mean nothing and would end up in whatever the
 * driver decides to log.
 */
async function configFor(source: SourceRegistration): Promise<sql.config> {
  const [server, instanceName] = source.host.split('\\');

  const base: sql.config = {
    server: server!,
    port: source.port,
    database: source.database,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    requestTimeout: REQUEST_TIMEOUT_MS,
    pool: { min: 0, max: 4, idleTimeoutMillis: 30_000 },
    options: {
      encrypt: source.encrypt,
      trustServerCertificate: source.trustServerCertificate,
      // A scan belongs on a replica where there is one.
      readOnlyIntent: true,
      // A named instance is reached through the SQL Browser service, not a port.
      ...(instanceName ? { instanceName } : {}),
      /*
        Ask the driver for JavaScript dates rather than strings.

        The probe coerces either way, so this is not load-bearing for correctness — it is here because
        `datetime2` arriving as a locale-formatted string is the kind of thing that works in one
        timezone and not another, and the scan timestamp is compared across scans.
      */
      useUTC: true,
    },
  };

  switch (source.auth) {
    case 'sqlLogin':
      return {
        ...base,
        user: source.username,
        // Read here, used immediately, never held. See decision 3.
        password: await resolveSecret(source.secretRef),
      };
    case 'ntlm': {
      /*
        A Windows domain account, over NTLM.

        The driver wants the domain separately from the user, so `DOMAIN\user` is split here. The domain
        is guaranteed present by `checkRegistration`, which refuses the registration without it — a blank
        domain produces failed logins against a domain controller, and a handful of those locks the
        account out.
      */
      const { domain, user } = splitWindowsLogin(source.username ?? '');
      return {
        ...base,
        authentication: {
          type: 'ntlm',
          options: { domain: domain ?? '', userName: user, password: await resolveSecret(source.secretRef) },
        },
      };
    }
    case 'integrated':
      /*
        Handled by `trustedConnectionConfig`, on a different driver entirely.

        Reached only if a caller bypasses `executorFor`. It is a throw rather than a fallthrough because
        the previous version of this branch returned a config that could not connect, and the failure
        surfaced as a driver type error a steward had no way to interpret.
      */
      throw new Error('A trusted connection is built by trustedConnectionConfig, not here.');
    case 'managedIdentity':
      /*
        `options` is required by the type and was previously absent, hidden by the same cast that hid
        the NTLM defect. Empty means the host's system-assigned identity; a *user*-assigned one would
        additionally need its `clientId` here.
      */
      return { ...base, authentication: { type: 'azure-active-directory-msi-app-service', options: {} } };
  }
}

/**
 * A trusted connection: the API process's own Windows identity.
 *
 * ── WHY THIS NEEDS A SECOND DRIVER ──────────────────────────────────────────────────────
 * Because `tedious` cannot do it. `mssql` runs on `tedious` by default, and `tedious` implements NTLM
 * with typed-in credentials and nothing else — there is no SSPI path in it, so there is no way for it
 * to present the token of the account the process is running as. The only route is `msnodesqlv8`, which
 * is a native binding over the Microsoft ODBC driver and therefore Windows-only in practice.
 *
 * ── AND WHY IT IS NOT A DEPENDENCY ──────────────────────────────────────────────────────
 * It is loaded on demand, and its absence is a message rather than a crash. Two reasons, and the second
 * is the real one:
 *
 *   1. It is a native module. Making every contributor on every platform build it to run a test suite
 *      that never opens a trusted connection is a cost paid by everyone for a path used by few.
 *   2. **npm cannot satisfy the actual prerequisite anyway.** `msnodesqlv8` binds to the Microsoft ODBC
 *      Driver for SQL Server, which is installed by the operating system, not by a package manager. A
 *      deployment that needs a trusted connection has an install step regardless; one npm command
 *      beside it is not what makes that hard, and pretending the dependency alone is sufficient would
 *      move the failure from a sentence here to an ODBC error nobody can read.
 */
async function trustedConnectionConfig(source: SourceRegistration): Promise<sql.config> {
  const [server, instanceName] = source.host.split('\\');

  /*
    The connection string is built here rather than left to `mssql`.

    Its own builder emits `Driver`, `Server`, `Database`, `Trusted_Connection` and `Encrypt` — and no
    `TrustServerCertificate`. Against the self-signed certificate that every non-production SQL Server
    has, and with ODBC Driver 18 defaulting `Encrypt` to yes, that combination cannot connect and the
    registration's own "trust an unverified certificate" tick would have no effect. So the string is
    ours, and the two transport decisions on the registration mean here what they mean everywhere else.
  */
  const target = instanceName ? `${server}\\${instanceName}` : `${server},${source.port ?? 1433}`;
  const connectionString = [
    `Driver={${ODBC_DRIVER}}`,
    `Server=${target}`,
    `Database=${source.database}`,
    'Trusted_Connection=yes',
    `Encrypt=${source.encrypt ? 'yes' : 'no'}`,
    `TrustServerCertificate=${source.trustServerCertificate ? 'yes' : 'no'}`,
  ].join(';');

  /*
    Cast, and for once not to hide a shape error.

    `@types/mssql` declares `connectionString` on `IOptions` — that is, inside `config.options`. The
    driver reads it from the top level (`this.config.connectionString` in
    `mssql/lib/msnodesqlv8/connection-pool.js`), and a connection string nested one level down is simply
    never seen, so the pool silently falls back to building its own without `TrustServerCertificate`.
    Writing it where the runtime looks is correct; the type is what is wrong.

    `server` and `database` are carried so the rest of the object is a real `config`, and are ignored
    whenever a connection string is present.
  */
  return {
    connectionString,
    server: server!,
    database: source.database,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    requestTimeout: REQUEST_TIMEOUT_MS,
    pool: { min: 0, max: 4, idleTimeoutMillis: 30_000 },
    // `trustedConnection` is belt and braces: unread while the string above is set, and the right value
    // for the driver's own builder if it ever is not.
    options: { useUTC: true, trustedConnection: true, ...(instanceName ? { instanceName } : {}) },
  } as unknown as sql.config;
}

/** The `mssql` surface bound to `msnodesqlv8`, or a sentence saying why there isn't one. */
async function trustedConnectionDriver(): Promise<typeof sql> {
  try {
    return ((await import('mssql/msnodesqlv8')) as { default: typeof sql }).default;
  } catch (error) {
    throw new Error(
      'A trusted connection uses the Windows account this API is running as, which needs the ' +
        'msnodesqlv8 driver — the default driver has no way to present a Windows token. Install it with ' +
        '"npm install msnodesqlv8", on a Windows host with the Microsoft ODBC Driver for SQL Server ' +
        'present. If neither is possible, register the source with a Windows domain login instead: that ' +
        'is DOMAIN\\user and a password, and it works on the default driver from any platform. ' +
        // The first line only. Node appends a require stack to a module-not-found error, and four
        // paths into node_modules after the sentence that explains the fix simply buries it.
        `(${safeMessage(error).split('\n')[0]})`,
    );
  }
}

export async function executorFor(source: SourceRegistration): Promise<SqlExecutor> {
  const label = `mssql://${source.host}${source.port ? `:${source.port}` : ''}/${source.database}`;

  let pool = pools.get(source.id);
  if (!pool?.connected) {
    if (pool) await pool.close().catch(() => undefined);

    /*
      The driver is chosen by the authentication mode, and only a trusted connection changes it.

      Resolved before the pool rather than inside the try, so that "this platform cannot open a trusted
      connection" is reported as itself and not wrapped in "Could not connect to mssql://…" — the second
      sends a reader to look at the network for a problem that is entirely local.
    */
    const trusted = source.auth === 'integrated';
    const driver = trusted ? await trustedConnectionDriver() : sql;
    const config = trusted ? await trustedConnectionConfig(source) : await configFor(source);

    try {
      pool = await new driver.ConnectionPool(config).connect();
    } catch (error) {
      // Reworded, because the driver's own message sometimes contains the config it was given.
      throw new Error(`Could not connect to ${label}: ${describeConnectFailure(error, source)}`);
    }
    pools.set(source.id, pool);
  }

  return {
    label,
    async query(text: string, params: Readonly<Record<string, unknown>> = {}): Promise<SqlRow[]> {
      const request = pool!.request();
      /*
        Named inputs, which is the entire reason the port takes named parameters.

        The probe's statements use `@schemas` and `@limit`; nothing about a schema list a steward typed
        into a form is ever concatenated into SQL. `request.input` sends it as a parameter, so the
        server parses the statement once and the value is data.
      */
      for (const [name, value] of Object.entries(params)) request.input(name, value);
      const result = await request.query(text);
      return result.recordset ?? [];
    },
  };
}

/** Close a source's pool — after a scan, or when a registration is edited or removed. */
export async function releaseExecutor(sourceId: string): Promise<void> {
  const pool = pools.get(sourceId);
  pools.delete(sourceId);
  await pool?.close().catch(() => undefined);
}

export async function releaseAll(): Promise<void> {
  await Promise.all([...pools.keys()].map(releaseExecutor));
}

/**
 * A driver error, with anything that looks like a credential removed.
 *
 * Belt and braces over decision 3: the password is never put anywhere it could be read back, and if a
 * driver version starts echoing its config in a message, that message does not become an error the UI
 * renders.
 */
function safeMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/((?:password|pwd)\s*[:=]\s*)\S+/gi, '$1[redacted]');
}

/**
 * The driver's message, plus the fix when this platform knows one.
 *
 * ── WHY ONLY THESE TWO ──────────────────────────────────────────────────────────────────
 * They are the two whose text sends a reader somewhere useless. `IM002` reads as a mistake in the
 * registration and is really an ODBC driver that is not installed; a domain login failure reads as a
 * wrong password and is very often a wrong *domain*, which the reader will not reconsider because they
 * know their password. Every other driver error already says what it means, and adding advice to those
 * would bury it.
 */
function describeConnectFailure(error: unknown, source: SourceRegistration): string {
  const message = safeMessage(error);

  if (/IM002|data source name not found|driver.*not found/i.test(message)) {
    return (
      `${message} — that is ODBC reporting no driver named "${ODBC_DRIVER}". Install the Microsoft ` +
      'ODBC Driver for SQL Server, or set OPUS_ODBC_DRIVER to the exact name of the one this machine ' +
      'has (it appears in the ODBC Data Sources app, under Drivers).'
    );
  }

  if (source.auth === 'ntlm' && /login failed|18456|not associated with a trusted/i.test(message)) {
    const { domain } = splitWindowsLogin(source.username ?? '');
    return (
      `${message} — the domain this tried was "${domain}". A wrong domain fails exactly like a wrong ` +
      'password, and repeated attempts count towards a lockout, so check it before trying again.'
    );
  }

  return message;
}
