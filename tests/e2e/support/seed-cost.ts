import { randomUUID } from 'node:crypto';
import { actorOf } from '../../../src/domain/accounts/actor.js';
import { CreateUser } from '../../../src/application/use-cases/create-user.js';
import { PgAuditLog } from '../../../src/infrastructure/db/pg-audit-log.js';
import { PgCostLedger } from '../../../src/infrastructure/db/pg-cost-ledger.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { createPool, type DatabasePool } from '../../../src/infrastructure/db/pool.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import {
  commonPasswordsFile,
  loadCommonPasswords,
} from '../../../src/infrastructure/security/common-passwords.js';
import { ScryptPasswordHasher } from '../../../src/infrastructure/security/scrypt-password-hasher.js';
import { SystemClock } from '../../../src/infrastructure/system/system-clock.js';
import { TimestampIdGenerator } from '../../../src/infrastructure/system/timestamp-id-generator.js';
import { fixturePassword } from '../../support/account-fixtures.js';
import { seededAdmin, type Credentials } from './seed.js';

// FAKE CREDENTIALS AND GENERATED SPEND ONLY (RNF-003), P1-36: the accounts of the cost specs, kept
// apart from seed.ts. Per Playwright project, `cost` watches the totals pill follow a run (RF-1010)
// and `cost-admin` is an administrator who sees the server month and the cap banner (RF-1106). One
// ledger row spends $8.50 on the server's keys this month, 85% of the $10.00 monthly cap every spec
// keeps (admin-users.spec.ts saves $10.00 again), so the banner is on for every administrator.

const projectNames = ['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark'] as const;

type CostKind = 'cost' | 'cost-admin';

export function costAccountFor(kind: CostKind, project: string): Credentials {
  return { userName: ['e2e', kind, project].join('-'), password: fixturePassword(`Acct${kind}`) };
}

/** The server-key spend the seed puts in the ledger: $8.50. */
const seededServerMicros = 8_500_000n;

async function createUserCase(pool: DatabasePool, clock: SystemClock): Promise<CreateUser> {
  return new CreateUser({
    users: new PgUserRepository(pool),
    hasher: new ScryptPasswordHasher(),
    auditLog: new PgAuditLog(pool, new SecretMasker()),
    logger: { log: () => Promise.resolve(), securityEvent: () => Promise.resolve() },
    clock,
    ids: new TimestampIdGenerator(clock),
    commonPasswords: await loadCommonPasswords(commonPasswordsFile),
  });
}

async function seedServerSpend(pool: DatabasePool, userId: string, at: Date): Promise<void> {
  await new PgCostLedger(pool).settle({
    ...{ at, userId, projectId: randomUUID(), runId: randomUUID(), agentTaskId: 'reader-seed' },
    ...{ stage: 'understand', role: 'reader', provider: 'openai', model: 'gpt-5-nano' },
    ...{ callId: 'e2e-seed#1', attempt: 1, keySource: 'server', inputTokens: 1000 },
    ...{ outputTokens: 100, cachedInputTokens: 0, usageSource: 'reported' },
    ...{ costMicros: seededServerMicros, costKnown: true, currency: 'USD' },
    priceTableVersion: 'e2e-seed',
  });
}

/** Creates the cost accounts through CreateUser and the server's spend this month. */
// RF-1010, RF-1106
export async function seedCost(databaseUrl: string): Promise<void> {
  const pool = createPool({ connectionString: databaseUrl, onIdleError: () => undefined });
  try {
    const admin = await new PgUserRepository(pool).findByUserName(seededAdmin.userName);
    if (admin === undefined) throw new Error('The bootstrap administrator was not created.');
    const clock = new SystemClock();
    const createUser = await createUserCase(pool, clock);
    const accounts = projectNames.flatMap((project) =>
      (['cost', 'cost-admin'] as const).map((kind) => ({ kind, project })),
    );
    const ids: string[] = [];
    for (const { kind, project } of accounts) {
      const { userName, password } = costAccountFor(kind, project);
      const outcome = await createUser.execute({
        ...{ actor: actorOf(admin), userName, displayName: `E2E ${kind}`, password },
        ...{ role: kind === 'cost' ? 'user' : 'admin', mustChangePassword: false, ip: 'e2e-seed' },
      });
      if (!outcome.ok) throw new Error(`The account ${userName} was refused (${outcome.error}).`);
      ids.push(outcome.value.id);
    }
    // The first administrator of the cost specs carries the server's spend.
    await seedServerSpend(pool, ids[1] ?? admin.id, clock.now());
  } finally {
    await pool.end();
  }
}
