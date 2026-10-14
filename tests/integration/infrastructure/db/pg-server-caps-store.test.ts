import { describe, expect, it } from 'vitest';
import type { AuditEventInput } from '../../../../src/application/ports/audit-log.js';
import type { ServerCaps } from '../../../../src/domain/budget/budget.js';
import { PgAuditLog } from '../../../../src/infrastructure/db/pg-audit-log.js';
import { PgServerCapsStore } from '../../../../src/infrastructure/db/pg-server-caps-store.js';
import { PgServerSettings } from '../../../../src/infrastructure/db/pg-server-settings.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { newId, user } from '../../../support/db-rows.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// RF-1106, RF-1109, ADR-016: the caps and the audit row of a caps change are one transaction on the
// disposable PostgreSQL. A change never lands without its audit row, and an audit row that cannot
// be written takes the change back with it.

const defaults: ServerCaps = {
  runMicros: 500_000n,
  userDayMicros: 1_000_000n,
  serverMonthMicros: 10_000_000n,
};
const changed: ServerCaps = {
  runMicros: 2_000_000n,
  userDayMicros: 3_000_000n,
  serverMonthMicros: 4_000_000n,
};
const at = new Date('2026-10-14T09:00:00.000Z');

function auditOf(actorUserId: string, overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    at,
    actorUserId,
    action: 'admin.caps_changed',
    targetType: 'server_settings',
    targetId: 'caps',
    ip: '127.0.0.1',
    outcome: 'ok',
    detail: { runMicros: '2000000' },
    ...overrides,
  };
}

describe.skipIf(!hasTestDatabase)('PgServerCapsStore', () => {
  const database = useTestDatabase();

  it('RF-1106 saves the caps and writes the audit row together', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const actor = newId();
    const row = user({ id: actor });
    await pool.query(row.sql, row.params);
    const store = new PgServerCapsStore(pool, new SecretMasker());

    await store.saveCaps(changed, { by: actor, at }, auditOf(actor));

    expect(await new PgServerSettings(pool).caps()).toEqual(changed);
    const audited = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM audit_events WHERE action = $1',
      ['admin.caps_changed'],
    );
    expect(audited.rows[0]?.n).toBe(1);
  });

  it('RF-1109 an audit row that cannot be written keeps the previous caps', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const actor = newId();
    const row = user({ id: actor });
    await pool.query(row.sql, row.params);
    const store = new PgServerCapsStore(pool, new SecretMasker());

    await expect(
      store.saveCaps(changed, { by: actor, at }, auditOf(actor, { at: new Date(Number.NaN) })),
    ).rejects.toThrow();

    expect(await new PgServerSettings(pool).caps()).toEqual(defaults);
    expect(await new PgAuditLog(pool, new SecretMasker()).list({ since: 0 })).toEqual([]);
  });
});
