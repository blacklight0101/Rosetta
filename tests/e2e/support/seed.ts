import { actorOf } from '../../../src/domain/accounts/actor.js';
import type { Logger } from '../../../src/application/ports/logger.js';
import { CreateUser } from '../../../src/application/use-cases/create-user.js';
import { PgAuditLog } from '../../../src/infrastructure/db/pg-audit-log.js';
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
import { disposableSchemaUrl } from './database.js';
import { e2ePort } from './server-config.js';
import { currentTestKey } from './account-key.js';

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
  /** Set on an account of one test: the kind and project `ensureAccount` creates it for. */
  readonly seed?: { readonly kind: E2eAccountKind; readonly project: string };
}

/** The Playwright projects (playwright.config.ts); each gets accounts of its own, as they run in parallel. */
const e2eProjectNames = ['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark'] as const;

/**
 * The accounts the page specs of P1-14 use, one set per project: `keys` stores and deletes keys,
 * `lock` is locked out, `force` and `force-admin` must change their password at first sign-in
 * (`force-admin` as an administrator, like the bootstrap account, which other specs need unchanged),
 * `cap` sets the daily cap on its own keys (DEC-107), `providers` presses the Test button (RF-407),
 * `projects` creates projects (RF-010), `admin` is an administrator who has chosen a password
 * (RF-1102, P1-42), `project-settings` edits settings (RF-002), `start-run` starts runs (RF-1001),
 * `live-run` watches the live page (RF-1002), `live-controls` pauses and meters runs (P1-95),
 * `live-coverage` and `live-coverage-pause` watch the coverage map (RF-1005, P1-141), `live-running`
 * watches a run while it runs (P1-169), `api-calls` reads its calls and logs (RF-1011), `replay`
 * owns a recorded run (seed-replay.ts, RF-506), `history` browses and deletes runs (RF-1008,
 * RF-1012), `history-admin` deletes snapshots, `project-runs` reads the run columns (RF-1108) and
 * `plan` answers Plan setup after an understand run (RF-605). The `journey-*` accounts (P1-46)
 * sign in, own a project and a run, play the other user, change a forced password, run the C# and
 * COBOL fixtures, create users and run on the server key. The visual sweep (RNF-010) has `sweep`,
 * which makes a project and its runs and opens every page, `sweep-admin` for the administration
 * pages and `sweep-force`, which keeps its temporary password so the first sign-in page stays open.
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
  | 'live-coverage-pause'
  | 'live-running'
  | 'api-calls'
  | 'history'
  | 'history-admin'
  | 'project-runs'
  | 'admin'
  | 'replay'
  | 'journey'
  | 'journey-owner'
  | 'journey-other'
  | 'journey-force'
  | 'journey-run'
  | 'journey-language'
  | 'journey-admin'
  | 'journey-server'
  | 'one-analyse'
  | 'sweep'
  | 'sweep-admin'
  | 'sweep-force'
  | 'plan';

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
  'live-coverage-pause',
  'live-running',
  'api-calls',
  'history',
  'history-admin',
  'project-runs',
  'admin',
  'replay',
  'journey',
  'journey-owner',
  'journey-other',
  'journey-force',
  'journey-run',
  'journey-language',
  'journey-admin',
  'journey-server',
  'one-analyse',
  'sweep',
  'sweep-admin',
  'sweep-force',
  'plan',
];

const adminKinds: ReadonlySet<E2eAccountKind> = new Set([
  'force-admin',
  'history-admin',
  'admin',
  'journey-admin',
  'sweep-admin',
]);
const forceKinds: ReadonlySet<E2eAccountKind> = new Set([
  'force',
  'force-admin',
  'journey-force',
  'sweep-force',
]);

/** Kinds whose pre-seeded account holds data the specs read (seed-replay.ts): always that account. */
const fixedAccountKinds: ReadonlySet<E2eAccountKind> = new Set(['replay']);

/** The account the seed pre-creates for a kind and project (outside any test). */
export function preseededAccountFor(kind: E2eAccountKind, project: string): Credentials {
  return { userName: ['e2e', kind, project].join('-'), password: fixturePassword(`Acct${kind}`) };
}

/**
 * The account of a kind in a project, for a test. It is the account of that test (and of that
 * repeat, `--repeat-each`), so tests that run in parallel or repeat never share an account, its
 * projects or its settings; it is created on first sign-in (`ensureAccount`). A kind in
 * `fixedAccountKinds` always gets its pre-seeded account. Called outside a test it throws: the
 * seed and other code outside tests use `preseededAccountFor`.
 */
export function accountFor(kind: E2eAccountKind, project: string): Credentials {
  if (fixedAccountKinds.has(kind)) return preseededAccountFor(kind, project);
  const key = currentTestKey(kind, project);
  // A user name has 40 characters at most (RF-1102), so the key stands for the kind and project.
  return {
    userName: `e2e-${key}`,
    password: fixturePassword(`Acct${kind}`),
    seed: { kind, project },
  };
}

const quiet: Logger = {
  log: () => Promise.resolve(),
  securityEvent: () => Promise.resolve(),
};

let commonPasswordList: Promise<ReadonlySet<string>> | undefined;

/** The use case that creates users, as the bootstrap administrator's actions do (P1-10). */
async function userCreation(pool: DatabasePool): Promise<CreateUser> {
  const clock = new SystemClock();
  commonPasswordList ??= loadCommonPasswords(commonPasswordsFile);
  return new CreateUser({
    users: new PgUserRepository(pool),
    hasher: new ScryptPasswordHasher(),
    auditLog: new PgAuditLog(pool, new SecretMasker()),
    logger: quiet,
    clock,
    ids: new TimestampIdGenerator(clock),
    commonPasswords: await commonPasswordList,
  });
}

/**
 * Creates the account of one test (see `accountFor`) in the disposable schema, unless it exists.
 * It is made by the same use case as the pre-seeded accounts, with the same role and forced change.
 */
export async function ensureAccount(credentials: Credentials): Promise<void> {
  if (credentials.seed === undefined) return;
  const databaseUrl = process.env['ROSETTA_TEST_DATABASE_URL'] ?? '';
  const pool = createPool({
    connectionString: disposableSchemaUrl(databaseUrl, e2ePort()),
    onIdleError: () => undefined,
  });
  try {
    const users = new PgUserRepository(pool);
    if ((await users.findByUserName(credentials.userName)) !== undefined) return;
    const admin = await users.findByUserName(seededAdmin.userName);
    if (admin === undefined) throw new Error('The bootstrap administrator was not created.');
    const { kind, project } = credentials.seed;
    const outcome = await (
      await userCreation(pool)
    ).execute({
      actor: actorOf(admin),
      userName: credentials.userName,
      displayName: `E2E ${kind}`,
      role: adminKinds.has(kind) ? 'admin' : 'user',
      // The account's own password, not the one a test tries (it may be a wrong one on purpose).
      password: fixturePassword(`Acct${kind}`),
      mustChangePassword: forceKinds.has(kind),
      ip: 'e2e-seed',
    });
    if (!outcome.ok) throw new Error(`The account of ${project} was refused (${outcome.error}).`);
  } finally {
    await pool.end();
  }
}

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
      const { userName, password } = preseededAccountFor(kind, project);
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
