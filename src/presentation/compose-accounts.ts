import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { PasswordHasher } from '../application/ports/password-hasher.js';
import type { SecretBox } from '../application/ports/secret-box.js';
import type { SessionStore } from '../application/ports/session-store.js';
import type { ModelList } from '../application/models/model-list.js';
import type { PriceTable } from '../domain/budget/price-table.js';
import type { ProviderSetFactory } from '../application/ports/provider-set-factory.js';
import { BootstrapAdmin } from '../application/use-cases/bootstrap-admin.js';
import { ChangePassword } from '../application/use-cases/change-password.js';
import { DeleteProviderKey } from '../application/use-cases/delete-provider-key.js';
import { ListProviderKeys } from '../application/use-cases/list-provider-keys.js';
import { ReEncryptProviderKeys } from '../application/use-cases/re-encrypt-provider-keys.js';
import { SaveProviderKey } from '../application/use-cases/save-provider-key.js';
import type { TestProviders } from '../application/use-cases/test-providers.js';
import { CreateUser } from '../application/use-cases/create-user.js';
import { ListAudit } from '../application/use-cases/list-audit.js';
import { ListUsers } from '../application/use-cases/list-users.js';
import { GetCaps } from '../application/use-cases/get-caps.js';
import type { ProjectSettings } from '../application/projects/project-settings.js';
import { GetDefaultRoles } from '../application/use-cases/get-default-roles.js';
import { GetSpendLimits } from '../application/use-cases/get-spend-limits.js';
import { GetOwnDailyCap } from '../application/use-cases/get-own-daily-cap.js';
import { SetCaps } from '../application/use-cases/set-caps.js';
import { SetDefaultRoles } from '../application/use-cases/set-default-roles.js';
import { SetOwnDailyCap } from '../application/use-cases/set-own-daily-cap.js';
import { ResetPassword } from '../application/use-cases/reset-password.js';
import { UpdateUser } from '../application/use-cases/update-user.js';
import { RecordRefusedRequest } from '../application/use-cases/record-refused-request.js';
import { ResolveSession } from '../application/use-cases/resolve-session.js';
import { SignIn } from '../application/use-cases/sign-in.js';
import { SignOut } from '../application/use-cases/sign-out.js';
import { ERROR_CODES } from '../domain/errors/codes.js';
import { describeError } from '../domain/errors/descriptions.js';
import { RosettaError } from '../domain/errors/rosetta-error.js';
import type { Environment } from '../infrastructure/config/environment.js';
import { PgAccountUsage } from '../infrastructure/db/pg-account-usage.js';
import { PgAuditLog } from '../infrastructure/db/pg-audit-log.js';
import { PgProviderKeyRepository } from '../infrastructure/db/pg-provider-key-repository.js';
import { PgServerCapsStore } from '../infrastructure/db/pg-server-caps-store.js';
import { PgServerSettings } from '../infrastructure/db/pg-server-settings.js';
import { PgSessionStore } from '../infrastructure/db/pg-session-store.js';
import { StreamRegistry } from './web/event-stream.js';
import { StreamClosingSessionStore } from './web/stream-closing-sessions.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import {
  commonPasswordsFile,
  loadCommonPasswords,
} from '../infrastructure/security/common-passwords.js';
import { createDummyHash } from '../infrastructure/security/dummy-password-hash.js';
import { DnsPublicHostCheck } from '../infrastructure/security/public-host-check.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';
import { composeProviders, type ProviderParts } from './compose-providers.js';
import type { CapServices } from './web/cap-routes.js';
import type { DefaultRoleServices } from './web/default-role-routes.js';
import type { KeyServices } from './web/key-routes.js';
import type { AccountServices, AuthServices } from './web/server.js';

// Architecture section 2 (composition root), RF-1102, RF-1100, RF-1101: the account adapters, the
// start-up step that creates the bootstrap administrator and the use cases behind the session API.
// One password hasher serves both, so at most two scrypt derivations run at a time (DEC-112). A
// refused bootstrap stops the start-up with the rule's RST code; the error names the variable,
// never its value.

export interface AccountParts {
  readonly environment: Pick<Environment, 'adminUser' | 'adminPassword'>;
  readonly pool: DatabasePool;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly masker: TextMasker;
  readonly hasher: PasswordHasher;
}

// RF-1102
export async function bootstrapAdministrator(parts: AccountParts): Promise<void> {
  const { environment, pool, logger, clock, masker, hasher } = parts;
  const bootstrap = new BootstrapAdmin({
    users: new PgUserRepository(pool),
    hasher,
    auditLog: new PgAuditLog(pool, masker),
    logger,
    clock,
    ids: new TimestampIdGenerator(clock),
    commonPasswords: await loadCommonPasswords(commonPasswordsFile),
  });
  const outcome = await bootstrap.execute({
    userName: environment.adminUser,
    password: environment.adminPassword,
  });
  if (!outcome.ok) {
    const variable =
      outcome.error === ERROR_CODES.userNameInvalid
        ? 'ROSETTA_ADMIN_USER'
        : 'ROSETTA_ADMIN_PASSWORD';
    throw new RosettaError(
      outcome.error,
      `${variable} was refused, so no administrator was created: ${describeError(outcome.error).message}`,
    );
  }
}

export interface Auth {
  readonly services: AuthServices;
  /** The provider factory, shared with the run executors (ADR-003). */
  readonly providers: ProviderSetFactory;
  /** The shipped price table, for the estimate before a run (RF-425). */
  readonly priceTable: PriceTable;
  /** The shipped model list: each model's context window and maximum output (Q-57). */
  readonly models: ModelList;
  /** For the hourly purge of expired sessions (architecture section 7, `Scheduler`). */
  readonly sessions: SessionStore;
  /** RF-1101: the open event streams, which end with their session (shared with the run routes). */
  readonly streams: StreamRegistry;
}

interface AccountAdapters {
  readonly pool: DatabasePool;
  readonly secretBox: SecretBox;
  readonly users: PgUserRepository;
  readonly sessions: SessionStore;
  readonly auditLog: PgAuditLog;
  readonly masker: TextMasker;
  readonly hasher: PasswordHasher;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly testProviders: TestProviders;
  readonly template: ProjectSettings;
}

// RF-1104: the key use cases. Base URLs are checked through node:dns on save (DEC-112).
function composeKeys(adapters: AccountAdapters): KeyServices {
  const { pool, secretBox, auditLog, logger, clock } = adapters;
  const keys = new PgProviderKeyRepository(pool);
  const base = { keys, auditLog, logger, clock };
  return {
    listProviderKeys: new ListProviderKeys({ keys }),
    saveProviderKey: new SaveProviderKey({
      ...base,
      box: secretBox,
      hostCheck: new DnsPublicHostCheck(),
    }),
    deleteProviderKey: new DeleteProviderKey(base),
  };
}

// RF-1106, DEC-107: the server caps (administrator) and the user's own daily cap.
function composeCaps(adapters: AccountAdapters): CapServices & DefaultRoleServices {
  const { pool, users, auditLog, masker, logger, clock, template } = adapters;
  const settings = new PgServerSettings(pool);
  const usage = new PgAccountUsage(pool);
  return {
    getCaps: new GetCaps({ settings, usage, clock }),
    setCaps: new SetCaps({
      settings,
      capsStore: new PgServerCapsStore(pool, masker),
      logger,
      clock,
    }),
    getDefaultRoles: new GetDefaultRoles({ settings, template }),
    setDefaultRoles: new SetDefaultRoles({ settings, auditLog, logger, clock }),
    getOwnDailyCap: new GetOwnDailyCap({ users }),
    getSpendLimits: new GetSpendLimits({ users, settings, usage, clock }),
    setOwnDailyCap: new SetOwnDailyCap({ users, auditLog, logger, clock }),
  };
}

// RF-1102, RF-1103, RF-1104, RF-1109: the account and administration use cases. They share the one
// hasher.
async function composeAccounts(adapters: AccountAdapters): Promise<AccountServices> {
  const { pool, users, sessions, auditLog, hasher, logger, clock } = adapters;
  const commonPasswords = await loadCommonPasswords(commonPasswordsFile);
  const base = { users, auditLog, logger, clock };
  return {
    changePassword: new ChangePassword({ ...base, hasher, sessions, commonPasswords }),
    createUser: new CreateUser({
      ...base,
      hasher,
      ids: new TimestampIdGenerator(clock),
      commonPasswords,
    }),
    updateUser: new UpdateUser({ ...base, sessions }),
    resetPassword: new ResetPassword({ ...base, hasher, sessions, commonPasswords }),
    listUsers: new ListUsers({ users, usage: new PgAccountUsage(pool), clock }),
    listAudit: new ListAudit({ auditLog, clock }),
    ...composeKeys(adapters),
    ...composeCaps(adapters),
    testProviders: adapters.testProviders,
  };
}

export interface AuthParts extends Omit<AccountParts, 'environment'> {
  /** RF-407: the provider factory reads the server keys, the Ollama address and the test mode. */
  readonly environment: ProviderParts['environment'];
  /** Test mode only: the model double that stands in for every adapter. */
  readonly doubles: ProviderParts['doubles'];
  /** RF-1104: seals the provider keys under ROSETTA_SECRET_KEY. */
  readonly secretBox: SecretBox;
}

// RF-1009, RF-1100, RF-1101
export async function composeAuth(
  mode: Pick<AuthParts, 'environment'> & { readonly doubles?: AuthParts['doubles'] },
  parts: Omit<AuthParts, 'environment' | 'doubles'>,
): Promise<Auth> {
  const { pool, logger, clock, masker, hasher, secretBox } = parts;
  // RF-407: loads the price table, so an invalid one stops the start-up (RST-1602).
  const { testProviders, factory, priceTable, models, template } = await composeProviders({
    ...parts,
    environment: mode.environment,
    doubles: mode.doubles,
  });
  const users = new PgUserRepository(pool);
  const streams = new StreamRegistry();
  const sessions = new StreamClosingSessionStore(new PgSessionStore(pool), streams);
  const auditLog = new PgAuditLog(pool, masker);
  const dummyHash = await createDummyHash(hasher);
  return {
    sessions,
    streams,
    providers: factory,
    priceTable,
    models,
    services: {
      accounts: await composeAccounts({
        ...{
          pool,
          secretBox,
          users,
          sessions,
          auditLog,
          masker,
          hasher,
          logger,
          clock,
          testProviders,
          template,
        },
      }),
      signIn: new SignIn({ users, hasher, sessions, auditLog, logger, clock, dummyHash }),
      signOut: new SignOut({ sessions, auditLog, logger, clock }),
      resolveSession: new ResolveSession({ sessions, users, logger, clock }),
      refusals: new RecordRefusedRequest({ auditLog, logger, clock }),
    },
  };
}

// RF-1104, DEC-112: the start-up step that re-encrypts the keys sealed under
// ROSETTA_SECRET_KEY_PREVIOUS; rows it cannot read are kept and reported in the log.
export async function reEncryptProviderKeys(
  parts: Pick<AuthParts, 'pool' | 'logger' | 'secretBox'>,
): Promise<void> {
  const { pool, logger, secretBox } = parts;
  const keys = new PgProviderKeyRepository(pool);
  await new ReEncryptProviderKeys({ keys, box: secretBox, logger }).execute();
}
