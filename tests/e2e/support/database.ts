import { createPool, type DatabasePool } from '../../../src/infrastructure/db/pool.js';

// ADR-016, data-model.md section 8: the disposable database of an end-to-end run. A schema of its
// own is made in the PostgreSQL at ROSETTA_TEST_DATABASE_URL (dropped first when a killed earlier
// run left it); serve.ts then runs the migrate step on it, because the server never migrates (DEC-140). The role the release migrations grant to is
// created here because migrations never create roles.

const ENSURE_APP_ROLE = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_app') THEN
    CREATE ROLE rosetta_app NOLOGIN;
  END IF;
EXCEPTION
  WHEN duplicate_object OR unique_violation THEN NULL;
END
$$`;

const SCHEMA_NAME = /^rst_e2e_[0-9]{4,5}$/;

export interface DisposableSchema {
  /** A connection URL whose connections use the schema. */
  readonly url: string;
  drop(): Promise<void>;
}

function ignoreIdleError(): void {
  // A connection closing while the schema is dropped is not a failure.
}

/** Runs one statement that the server builds with `format()` from a fixed template and a name. */
async function runFormatted(pool: DatabasePool, template: string, name: string): Promise<void> {
  const formatted = await pool.query<{ sql: string }>('SELECT format($1, $2::text) AS sql', [
    template,
    name,
  ]);
  const sql = formatted.rows[0]?.sql;
  if (sql === undefined) throw new Error('format() returned no statement');
  await pool.query(sql);
}

function schemaName(port: number): string {
  const name = `rst_e2e_${String(port)}`;
  if (!SCHEMA_NAME.test(name)) throw new Error(`Unusable e2e schema name ${name}`);
  return name;
}

/** Drops the schema of the run on this port, if it exists. */
export async function dropDisposableSchema(databaseUrl: string, port: number): Promise<void> {
  const pool = createPool({ connectionString: databaseUrl, onIdleError: ignoreIdleError });
  try {
    await runFormatted(pool, 'DROP SCHEMA IF EXISTS %I CASCADE', schemaName(port));
  } finally {
    await pool.end();
  }
}

/** A connection URL whose connections use the disposable schema of the run on this port. */
export function disposableSchemaUrl(databaseUrl: string, port: number): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${schemaName(port)}`);
  return url.toString();
}

/** Makes an empty schema `rst_e2e_<port>`; a leftover of the same name is dropped first. */
export async function createDisposableSchema(
  databaseUrl: string,
  port: number,
): Promise<DisposableSchema> {
  const name = schemaName(port);
  const admin = createPool({ connectionString: databaseUrl, onIdleError: ignoreIdleError });
  try {
    await admin.query(ENSURE_APP_ROLE);
    await runFormatted(admin, 'DROP SCHEMA IF EXISTS %I CASCADE', name);
    await runFormatted(admin, 'CREATE SCHEMA %I', name);
    await runFormatted(admin, 'GRANT USAGE ON SCHEMA %I TO rosetta_app', name);
  } finally {
    await admin.end();
  }
  return {
    url: disposableSchemaUrl(databaseUrl, port),
    drop: () => dropDisposableSchema(databaseUrl, port),
  };
}
