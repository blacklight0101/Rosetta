import { actorOf } from '../../../src/domain/accounts/actor.js';
import type { Logger } from '../../../src/application/ports/logger.js';
import { CreateUser } from '../../../src/application/use-cases/create-user.js';
import { PgAuditLog } from '../../../src/infrastructure/db/pg-audit-log.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { createPool } from '../../../src/infrastructure/db/pool.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import {
  commonPasswordsFile,
  loadCommonPasswords,
} from '../../../src/infrastructure/security/common-passwords.js';
import { ScryptPasswordHasher } from '../../../src/infrastructure/security/scrypt-password-hasher.js';
import { SystemClock } from '../../../src/infrastructure/system/system-clock.js';
import { TimestampIdGenerator } from '../../../src/infrastructure/system/timestamp-id-generator.js';
import { fixturePassword } from '../../support/account-fixtures.js';

// FAKE CREDENTIALS ONLY (RNF-003): the accounts of an end-to-end run. The test server creates the
// administrator at start-up through the bootstrap use case (RF-1102), so it must change its
// password before it reaches anything but the session API and the change-password page. Then
// `seedUsers` creates a normal user through the CreateUser use case (P1-10), without a forced
// change (RF-1107), for the journeys that need a signed-in user. The passwords are built at run
// time from harmless pieces and exist only in the disposable database of one run.

export const seededAdmin = {
  userName: ['e2e', 'admin'].join('.'),
  password: fixturePassword('E2e'),
} as const;

export const seededUser = {
  userName: ['e2e', 'user'].join('.'),
  password: fixturePassword('E2eUser'),
} as const;

export interface Credentials {
  readonly userName: string;
  readonly password: string;
}

/** The Playwright projects (playwright.config.ts); each gets accounts of its own, as they run in parallel. */
const e2eProjectNames = ['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark'] as const;

/**
 * The accounts the page specs of P1-14 use, one set per project: `keys` stores and deletes keys,
 * `lock` is locked out, `force` and `force-admin` must change their password at first sign-in
 * (`force-admin` as an administrator, like the bootstrap account, which other specs need unchanged),
 * `cap` sets the daily cap on its own keys (DEC-107), `providers` presses the Test button (RF-407),
 * `projects` creates projects (RF-010), `admin` is an administrator who has already chosen a
 * password and runs the administration pages (RF-1102, P1-42), `project-settings` edits one
 * project's settings (RF-002) and `start-run` starts runs of its own project (RF-1001), `live-run` watches
 * the runs of its own project on the live page (RF-1002), `live-controls` pauses and meters its own runs (P1-95), `live-coverage` watches the coverage map of its own runs (RF-1005), `api-calls` reads the calls and logs of
 * its own run (RF-1011), `replay` owns a recorded run (seed-replay.ts) whose report and replay
 * page it opens (RF-506), `history` browses and deletes the runs of its own project (RF-1008,
 * RF-1012) and `history-admin` is the administrator who deletes snapshots. The journey specs
 * (P1-46) have accounts of their own: `journey` signs in through the pages, `journey-owner` owns
 * a project and a run, `journey-other` is the second user who must not see them, `journey-force`
 * must change its password at first sign-in, `journey-run` runs the pipeline on the C# fixture,
 * `journey-language` on the COBOL one and `journey-admin` is the administrator who creates a user
 * and saves the caps.
 */
export type E2eAccountKind =
  | 'keys'
  | 'lock'
  | 'force'
  | 'force-admin'
  | 'cap'
  | 'providers'
  | 'projects'
  | 'project-settings'
  | 'start-run'
  | 'live-run'
  | 'live-controls'
  | 'live-coverage'
  | 'api-calls'
  | 'history'
  | 'history-admin'
  | 'admin'
  | 'replay'
  | 'journey'
  | 'journey-owner'
  | 'journey-other'
  | 'journey-force'
  | 'journey-run'
  | 'journey-language'
  | 'journey-admin';

const accountKinds: readonly E2eAccountKind[] = [
  'keys',
  'lock',
  'force',
  'force-admin',
  'cap',
  'providers',
  'projects',
  'project-settings',
  'start-run',
  'live-run',
  'live-controls',
  'live-coverage',
  'api-calls',
  'history',
  'history-admin',
  'admin',
  'replay',
  'journey',
  'journey-owner',
  'journey-other',
  'journey-force',
  'journey-run',
  'journey-language',
  'journey-admin',
];

const adminKinds: ReadonlySet<E2eAccountKind> = new Set([
  'force-admin',
  'history-admin',
  'admin',
  'journey-admin',
]);
const forceKinds: ReadonlySet<E2eAccountKind> = new Set(['force', 'force-admin', 'journey-force']);

export function accountFor(kind: E2eAccountKind, project: string): Credentials {
  return {
    userName: ['e2e', kind, project].join('-'),
    password: fixturePassword(`Acct${kind}`),
  };
}

const quiet: Logger = {
  log: () => Promise.resolve(),
  securityEvent: () => Promise.resolve(),
};

/** Creates `seededUser` through CreateUser, as the bootstrap administrator. */
// RF-1102
export async function seedUsers(databaseUrl: string): Promise<void> {
  const pool = createPool({ connectionString: databaseUrl, onIdleError: () => undefined });
  try {
    const users = new PgUserRepository(pool);
    const admin = await users.findByUserName(seededAdmin.userName);
    if (admin === undefined) throw new Error('The bootstrap administrator was not created.');
    const clock = new SystemClock();
    const createUser = new CreateUser({
      users,
      hasher: new ScryptPasswordHasher(),
      auditLog: new PgAuditLog(pool, new SecretMasker()),
      logger: quiet,
      clock,
      ids: new TimestampIdGenerator(clock),
      commonPasswords: await loadCommonPasswords(commonPasswordsFile),
    });
    const created = await createUser.execute({
      actor: actorOf(admin),
      userName: seededUser.userName,
      displayName: 'End-to-end User',
      role: 'user',
      password: seededUser.password,
      mustChangePassword: false,
      ip: 'e2e-seed',
    });
    if (!created.ok) throw new Error(`The seeded user was refused (${created.error}).`);
    const accounts = e2eProjectNames.flatMap((project) =>
      accountKinds.map((kind) => ({ kind, project })),
    );
    for (const { kind, project } of accounts) {
      const { userName, password } = accountFor(kind, project);
      const outcome = await createUser.execute({
        actor: actorOf(admin),
        userName,
        displayName: `E2E ${kind}`,
        role: adminKinds.has(kind) ? 'admin' : 'user',
        password,
        mustChangePassword: forceKinds.has(kind),
        ip: 'e2e-seed',
      });
      if (!outcome.ok) throw new Error(`The account ${userName} was refused (${outcome.error}).`);
    }
  } finally {
    await pool.end();
  }
}
