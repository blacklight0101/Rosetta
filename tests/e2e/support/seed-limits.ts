import { PgCostLedger } from '../../../src/infrastructure/db/pg-cost-ledger.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { createPool } from '../../../src/infrastructure/db/pool.js';
import { SystemClock } from '../../../src/infrastructure/system/system-clock.js';
import { disposableSchemaUrl } from './database.js';
import { e2ePort } from './server-config.js';

// GENERATED SPEND ONLY (RNF-003), P1-106: puts one account's day in a known state, so the start page
// can be checked against the amount that is really left. The account's own day cap on the server's
// keys is set (the administrator's figure for the account, DEC-107) and one ledger row spends part
// of it on the server's keys now. Nothing else of the server's month or of other accounts changes.

/** The project and run of the seeded call: fixed ids that name no real project or run. */
const seededProjectId = '00000000-0000-4000-8000-0000000e2e11';
const seededRunId = '00000000-0000-4000-8000-0000000e2e12';

// P1-106
export async function leaveOnlyThisInTheDay(
  userName: string,
  leftMicros: bigint,
  dayCapMicros: bigint,
): Promise<void> {
  const pool = createPool({
    connectionString: disposableSchemaUrl(
      process.env['ROSETTA_TEST_DATABASE_URL'] ?? '',
      e2ePort(),
    ),
    onIdleError: () => undefined,
  });
  try {
    const user = await new PgUserRepository(pool).findByUserName(userName);
    if (user === undefined) throw new Error(`The account ${userName} does not exist.`);
    await pool.query('UPDATE users SET daily_cap_micros = $2 WHERE id = $1', [
      user.id,
      dayCapMicros.toString(),
    ]);
    await new PgCostLedger(pool).settle({
      ...{ at: new SystemClock().now(), userId: user.id, projectId: seededProjectId },
      ...{ runId: seededRunId, agentTaskId: 'reader-limits', stage: 'understand' },
      ...{ role: 'reader', provider: 'openai', model: 'gpt-5-nano', callId: 'e2e-limits#1' },
      ...{ attempt: 1, keySource: 'server', inputTokens: 1000, outputTokens: 100 },
      ...{ cachedInputTokens: 0, usageSource: 'reported', costKnown: true, currency: 'USD' },
      costMicros: dayCapMicros - leftMicros,
      priceTableVersion: 'e2e-seed',
    });
  } finally {
    await pool.end();
  }
}
