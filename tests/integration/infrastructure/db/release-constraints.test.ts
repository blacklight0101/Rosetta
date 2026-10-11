import { beforeAll, describe, expect, it } from 'vitest';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';
import {
  auditEvent,
  insert,
  ledgerRow,
  newId,
  outcomeOf,
  project,
  providerKey,
  reservation,
  run,
  session,
  user,
  type Insert,
} from '../../../support/db-rows.js';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const NOT_NULL_VIOLATION = '23502';
const FOREIGN_KEY_VIOLATION = '23503';

interface Parents {
  readonly userId: string;
  readonly projectId: string;
}

type Case = readonly [string, (parents: Parents) => Insert];

/** Rows that break one rule of data-model.md section 4 each; the CHECK refuses them. */
const refusedByCheck: readonly Case[] = [
  ['users.user_name with capitals', () => user({ user_name: 'Admin' })],
  ['users.user_name shorter than 3', () => user({ user_name: 'ab' })],
  ['users.user_name longer than 40', () => user({ user_name: 'a'.repeat(41) })],
  ['users.display_name empty', () => user({ display_name: '' })],
  ['users.display_name longer than 80', () => user({ display_name: 'a'.repeat(81) })],
  ['users.role outside admin, user', () => user({ role: 'owner' })],
  ['users.state Locked (derived, never stored)', () => user({ state: 'Locked' })],
  ['users.failed_sign_ins negative', () => user({ failed_sign_ins: -1 })],
  ['sessions.id_hash not 32 bytes', (p) => session(p.userId, { id_hash: Buffer.alloc(31) })],
  ['sessions.user_agent over 200', (p) => session(p.userId, { user_agent: 'a'.repeat(201) })],
  ['provider_keys.provider ollama', (p) => providerKey(p.userId, { provider: 'ollama' })],
  [
    'provider_keys openai-compatible without base_url',
    (p) => providerKey(p.userId, { provider: 'openai-compatible', base_url: null }),
  ],
  ['provider_keys.last4 longer than 4', (p) => providerKey(p.userId, { last4: '12345' })],
  ['runs.stage unknown', (p) => run(p.projectId, p.userId, { stage: 'deploy' })],
  ['runs.queue_state unknown', (p) => run(p.projectId, p.userId, { queue_state: 'Paused' })],
  [
    'runs.end_state unknown',
    (p) => run(p.projectId, p.userId, { queue_state: 'Ended', end_state: 'Done' }),
  ],
  ['runs Ended without end_state', (p) => run(p.projectId, p.userId, { queue_state: 'Ended' })],
  [
    'runs Running with an end_state',
    (p) => run(p.projectId, p.userId, { queue_state: 'Running', end_state: 'Failed' }),
  ],
  ['cost_ledger.stage unknown', (p) => ledgerRow(p.userId, { stage: 'deploy' })],
  ['cost_ledger.key_source unknown', (p) => ledgerRow(p.userId, { key_source: 'shared' })],
  ['cost_ledger.usage_source unknown', (p) => ledgerRow(p.userId, { usage_source: 'guessed' })],
  ['cost_ledger.attempt 0', (p) => ledgerRow(p.userId, { attempt: 0 })],
  ['cost_ledger.currency not ISO 4217', (p) => ledgerRow(p.userId, { currency: 'usd' })],
  ['cost_reservations.key_source unknown', (p) => reservation(p.userId, { key_source: 'x' })],
  ['audit_events.outcome unknown', () => auditEvent({ outcome: 'maybe' })],
];

/** Rows the schema accepts, including the edge values of each rule. */
const accepted: readonly Case[] = [
  ['users.user_name with dot, dash and underscore', () => user({ user_name: 'a.b-c_9' })],
  ['users admin, MustChangePassword', () => user({ role: 'admin', state: 'MustChangePassword' })],
  ['users Disabled', () => user({ state: 'Disabled' })],
  [
    'provider_keys openai-compatible with base_url',
    (p) =>
      providerKey(p.userId, { provider: 'openai-compatible', base_url: 'https://api.example.com' }),
  ],
  ['provider_keys anthropic', (p) => providerKey(p.userId, { provider: 'anthropic' })],
  [
    'runs Ended with Interrupted',
    (p) => run(p.projectId, p.userId, { queue_state: 'Ended', end_state: 'Interrupted' }),
  ],
  ['cost_ledger provider-test row', (p) => ledgerRow(p.userId, { stage: 'provider-test' })],
  [
    'cost_ledger row without project and run (DEC-55)',
    (p) => ledgerRow(p.userId, { project_id: null, run_id: null, key_source: 'none' }),
  ],
  ['cost_ledger row for a project that no longer exists', (p) => ledgerRow(p.userId)],
  ['audit_events anonymous refused', () => auditEvent({ outcome: 'refused' })],
];

const database = useTestDatabase();
const parents = { userId: newId(), projectId: newId() };
let ready: Promise<DatabasePool> | undefined;

/** One migrated schema for the file, with an owner and a project to hang rows on. */
function migratedSchema(): Promise<DatabasePool> {
  ready ??= (async () => {
    const { pool } = await database.createSchema({ migrate: true });
    await insert(pool, user({ id: parents.userId, user_name: 'owner' }));
    await insert(pool, project(parents.userId, { id: parents.projectId }));
    return pool;
  })();
  return ready;
}

describe.skipIf(!hasTestDatabase)('release-1 checks', () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = await migratedSchema();
  });

  it.each(refusedByCheck)('RF-1302 refuses %s', async (_, row) => {
    expect(await outcomeOf(pool, row(parents))).toBe(CHECK_VIOLATION);
  });

  it.each(accepted)('RF-1302 accepts %s', async (_, row) => {
    expect(await outcomeOf(pool, row(parents))).toBe('ok');
  });
});

describe.skipIf(!hasTestDatabase)('release-1 keys and defaults', () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = await migratedSchema();
  });

  it('RF-1302 a user name is unique', async () => {
    expect(await outcomeOf(pool, user({ user_name: 'owner' }))).toBe(UNIQUE_VIOLATION);
  });

  it('RF-1302 a project source is unique per user, source URL, ref and subpath', async () => {
    const source = { source_url: 'https://github.com/owner/once' };
    await insert(pool, project(parents.userId, source));

    expect(await outcomeOf(pool, project(parents.userId, source))).toBe(UNIQUE_VIOLATION);
    expect(await outcomeOf(pool, project(parents.userId, { ...source, ref: 'v2' }))).toBe('ok');
  });

  it('RF-1302 a run key is unique per project', async () => {
    const key = { run_key: '20261011-090000-scan' };
    await insert(pool, run(parents.projectId, parents.userId, key));

    expect(await outcomeOf(pool, run(parents.projectId, parents.userId, key))).toBe(
      UNIQUE_VIOLATION,
    );
  });

  it('RF-1302 server_keys_allowed defaults to true', async () => {
    const result = await pool.query<{ fallback: string }>(
      `SELECT column_default AS fallback FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
      ['users', 'server_keys_allowed'],
    );

    expect(result.rows).toEqual([{ fallback: 'true' }]);
  });

  it('RF-1302 required columns refuse null', async () => {
    expect(await outcomeOf(pool, user({ password_hash: null }))).toBe(NOT_NULL_VIOLATION);
  });
});

describe.skipIf(!hasTestDatabase)('release-1 references', () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = await migratedSchema();
  });

  it('RF-1302 a session needs an existing user', async () => {
    expect(await outcomeOf(pool, session(newId()))).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("RF-1105 a run's user is the owner of its project", async () => {
    const otherId = newId();
    await insert(pool, user({ id: otherId }));

    expect(await outcomeOf(pool, run(parents.projectId, otherId))).toBe(FOREIGN_KEY_VIOLATION);
    expect(await outcomeOf(pool, run(parents.projectId, parents.userId))).toBe('ok');
  });

  it('RF-1302 deleting a user deletes its sessions, deleting a project deletes its runs', async () => {
    const ownerId = newId();
    const projectId = newId();
    await insert(pool, user({ id: ownerId }));
    await insert(pool, session(ownerId));
    await insert(pool, project(ownerId, { id: projectId }));
    await insert(pool, run(projectId, ownerId));

    await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
    await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);

    const left = await pool.query<{ sessions: string; runs: string }>(
      `SELECT (SELECT count(*) FROM sessions WHERE user_id = $1) AS sessions,
              (SELECT count(*) FROM runs WHERE project_id = $2) AS runs`,
      [ownerId, projectId],
    );
    expect(left.rows).toEqual([{ sessions: '0', runs: '0' }]);
  });
});
