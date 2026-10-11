import type { DatabasePool } from '../../src/infrastructure/db/pool.js';
import { testClock } from './postgres.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// Valid rows for the release-1 tables, with fixed parameterised INSERT statements. A test
// overrides one value to see the schema refuse it. Generated test data only.

type Values = Readonly<Record<string, unknown>>;

export interface Insert {
  readonly sql: string;
  readonly params: unknown[];
}

const ids = new SequenceIdGenerator();
const at = testClock.now();

/** A fresh predictable UUID; unique within one test file (each file has its own schema). */
export function newId(): string {
  return ids.uuid();
}

/** The last twelve digits of a fresh id, for names that must be unique. */
function suffix(): string {
  return newId().slice(-12);
}

/** The fixed statement, with the values in the order of `defaults` (the statement's columns). */
function statement(sql: string, defaults: Values, overrides: Values): Insert {
  const row: Values = { ...defaults, ...overrides };
  return { sql, params: Object.keys(defaults).map((column) => row[column]) };
}

export function user(overrides: Values = {}): Insert {
  return statement(
    'INSERT INTO users (id, user_name, display_name, role, state, password_hash, failed_sign_ins, server_keys_allowed, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    {
      id: newId(),
      user_name: `user.${suffix()}`,
      display_name: 'Test User',
      role: 'user',
      state: 'Active',
      password_hash: 'scrypt$16384$8$1$c2FsdA==$aGFzaA==',
      failed_sign_ins: 0,
      server_keys_allowed: true,
      created_at: at,
      updated_at: at,
    },
    overrides,
  );
}

export function session(userId: string, overrides: Values = {}): Insert {
  return statement(
    'INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    {
      id_hash: Buffer.alloc(32, newId()),
      user_id: userId,
      created_at: at,
      last_seen_at: at,
      expires_at: at,
      ip: '127.0.0.1',
      user_agent: 'vitest',
    },
    overrides,
  );
}

export function providerKey(userId: string, overrides: Values = {}): Insert {
  return statement(
    'INSERT INTO provider_keys (user_id, provider, base_url, ciphertext, iv, auth_tag, key_version, last4, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    {
      user_id: userId,
      provider: 'openai',
      base_url: null,
      ciphertext: Buffer.from('ciphertext'),
      iv: Buffer.alloc(12),
      auth_tag: Buffer.alloc(16),
      key_version: 'v1-test',
      last4: 'abcd',
      created_at: at,
      updated_at: at,
    },
    overrides,
  );
}

export function project(userId: string, overrides: Values = {}): Insert {
  return statement(
    'INSERT INTO projects (id, user_id, name, source_url, ref, subpath, settings, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    {
      id: newId(),
      user_id: userId,
      name: 'owner/repo',
      source_url: `https://github.com/owner/repo-${suffix()}`,
      ref: '',
      subpath: '',
      settings: { schemaVersion: 1 },
      created_at: at,
      updated_at: at,
    },
    overrides,
  );
}

export function run(projectId: string, userId: string, overrides: Values = {}): Insert {
  return statement(
    'INSERT INTO runs (id, project_id, user_id, run_key, stage, queue_state, end_state, queued_at, cost_micros, input_tokens, output_tokens, cached_input_tokens) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
    {
      id: newId(),
      project_id: projectId,
      user_id: userId,
      run_key: `20261011-090000-scan-${suffix()}`,
      stage: 'scan',
      queue_state: 'Queued',
      end_state: null,
      queued_at: at,
      cost_micros: 0,
      input_tokens: 0,
      output_tokens: 0,
      cached_input_tokens: 0,
    },
    overrides,
  );
}

export function ledgerRow(userId: string, overrides: Values = {}): Insert {
  return statement(
    'INSERT INTO cost_ledger (at, user_id, project_id, run_id, stage, role, provider, model, call_id, attempt, key_source, input_tokens, output_tokens, cached_input_tokens, usage_source, cost_micros, currency, price_table_version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)',
    {
      at,
      user_id: userId,
      project_id: newId(),
      run_id: newId(),
      stage: 'understand',
      role: 'reader',
      provider: 'fake',
      model: 'fake-model',
      call_id: '20261011-090000-understand#1',
      attempt: 1,
      key_source: 'server',
      input_tokens: 10,
      output_tokens: 5,
      cached_input_tokens: 0,
      usage_source: 'reported',
      cost_micros: 42,
      currency: 'USD',
      price_table_version: '2026-10-11',
    },
    overrides,
  );
}

export function reservation(userId: string, overrides: Values = {}): Insert {
  return statement(
    'INSERT INTO cost_reservations (call_id, user_id, run_id, key_source, worst_case_micros, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
    {
      call_id: `call-${suffix()}`,
      user_id: userId,
      run_id: newId(),
      key_source: 'server',
      worst_case_micros: 100,
      expires_at: at,
    },
    overrides,
  );
}

export function auditEvent(overrides: Values = {}): Insert {
  return statement(
    'INSERT INTO audit_events (at, actor_user_id, action, ip, outcome, detail) VALUES ($1, $2, $3, $4, $5, $6)',
    {
      at,
      actor_user_id: null,
      action: 'auth.sign_in',
      ip: '127.0.0.1',
      outcome: 'ok',
      detail: {},
    },
    overrides,
  );
}

/** Inserts the row and keeps it. */
export async function insert(pool: DatabasePool, row: Insert): Promise<void> {
  await pool.query(row.sql, row.params);
}

/** Runs the statement in a transaction that is always rolled back; returns the SQLSTATE or 'ok'. */
export async function outcomeOf(pool: DatabasePool, row: Insert, role?: string): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (role !== undefined) await client.query('SELECT set_config($1, $2, true)', ['role', role]);
    await client.query(row.sql, row.params);
    return 'ok';
  } catch (error) {
    if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
      return error.code;
    }
    throw error;
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
