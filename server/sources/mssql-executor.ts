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
import type { SourceRegistration, SqlExecutor, SqlRow } from '@opus/catalog-ingest';

import { resolveSecret } from './secrets';

/** How long to wait for a connection, and for a statement. Both bounded, separately. */
const CONNECT_TIMEOUT_MS = Number(process.env['SCAN_CONNECT_TIMEOUT_MS'] ?? 10_000);
const REQUEST_TIMEOUT_MS = Number(process.env['SCAN_REQUEST_TIMEOUT_MS'] ?? 60_000);

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
    case 'integrated':
      // Windows / Entra integrated. The host process's identity, so there is no secret in it.
      return { ...base, authentication: { type: 'ntlm', options: {} } } as sql.config;
    case 'managedIdentity':
      return { ...base, authentication: { type: 'azure-active-directory-msi-app-service' } } as sql.config;
  }
}

export async function executorFor(source: SourceRegistration): Promise<SqlExecutor> {
  const label = `mssql://${source.host}${source.port ? `:${source.port}` : ''}/${source.database}`;

  let pool = pools.get(source.id);
  if (!pool?.connected) {
    if (pool) await pool.close().catch(() => undefined);
    try {
      pool = await new sql.ConnectionPool(await configFor(source)).connect();
    } catch (error) {
      // Reworded, because the driver's own message sometimes contains the config it was given.
      throw new Error(`Could not connect to ${label}: ${safeMessage(error)}`);
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
