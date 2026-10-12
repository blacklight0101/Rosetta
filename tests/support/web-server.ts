import type { FastifyInstance } from 'fastify';
import type { DefaultRoles } from '../../src/application/projects/default-roles.js';
import type { PasswordHasher } from '../../src/application/ports/password-hasher.js';
import { ChangePassword } from '../../src/application/use-cases/change-password.js';
import { CreateUser } from '../../src/application/use-cases/create-user.js';
import { ListAudit } from '../../src/application/use-cases/list-audit.js';
import { ListUsers } from '../../src/application/use-cases/list-users.js';
import { RecordRefusedRequest } from '../../src/application/use-cases/record-refused-request.js';
import { ResolveSession } from '../../src/application/use-cases/resolve-session.js';
import { SignIn } from '../../src/application/use-cases/sign-in.js';
import { ResetPassword } from '../../src/application/use-cases/reset-password.js';
import { SignOut } from '../../src/application/use-cases/sign-out.js';
import { UpdateUser } from '../../src/application/use-cases/update-user.js';
import { GetCaps } from '../../src/application/use-cases/get-caps.js';
import { GetOwnDailyCap } from '../../src/application/use-cases/get-own-daily-cap.js';
import { SetCaps } from '../../src/application/use-cases/set-caps.js';
import { SetOwnDailyCap } from '../../src/application/use-cases/set-own-daily-cap.js';
import { StartRun } from '../../src/application/use-cases/start-run.js';
import { TestProviders } from '../../src/application/use-cases/test-providers.js';
import { CreateProject } from '../../src/application/use-cases/create-project.js';
import { GetProject } from '../../src/application/use-cases/get-project.js';
import { ListProjects } from '../../src/application/use-cases/list-projects.js';
import { OpenWorkspace } from '../../src/application/use-cases/open-workspace.js';
import { UpdateProjectSettings } from '../../src/application/use-cases/update-project-settings.js';
import { MemoryAccountUsage } from '../../src/infrastructure/db/memory-account-usage.js';
import { MemoryCostLedger } from '../../src/infrastructure/db/memory-cost-ledger.js';
import { MemoryAuditLog } from '../../src/infrastructure/db/memory-audit-log.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import { MemorySessionStore } from '../../src/infrastructure/db/memory-session-store.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { GuardedProviderFactory } from '../../src/infrastructure/providers/provider-factory.js';
import { unrecordedSinks } from '../../src/infrastructure/providers/unrecorded-sinks.js';
import { AesGcmSecretBox } from '../../src/infrastructure/security/aes-gcm-secret-box.js';
import { DnsPublicHostCheck } from '../../src/infrastructure/security/public-host-check.js';
import { DeleteProviderKey } from '../../src/application/use-cases/delete-provider-key.js';
import { ListProviderKeys } from '../../src/application/use-cases/list-provider-keys.js';
import { SaveProviderKey } from '../../src/application/use-cases/save-provider-key.js';
import { StreamRegistry } from '../../src/presentation/web/event-stream.js';
import { buildServer, type ServerOptions } from '../../src/presentation/web/server.js';
import { commonPasswords, FakePasswordHasher } from './account-fixtures.js';
import { budgetTable } from './budget-harness.js';
import { FakeDatabaseHealth } from './fake-database-health.js';
import { FakeHostResolver } from './fake-host-resolver.js';
import { fakeAdapters, SpyLedger, type FakeAdapters } from './provider-factory-harness.js';
import { fixtureSecret } from './provider-key-fixtures.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { templateSettings } from './project-fixtures.js';
import { ManualScheduler } from './manual-scheduler.js';
import { createRunHarness, type EventStore, type RunHarness } from './run-harness.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

/** The version the test servers report on /healthz. */
export const testVersion = '1.2.3-test';

/** The public URL of the test servers; state-changing requests send it as their Origin. */
export const testPublicUrl = 'http://127.0.0.1:8080';

export interface TestServer {
  readonly server: FastifyInstance;
  readonly logger: MemoryLogger;
  readonly health: FakeDatabaseHealth;
  readonly clock: FixedClock;
  readonly users: MemoryUserRepository;
  readonly sessions: MemorySessionStore;
  readonly audit: MemoryAuditLog;
  readonly projects: MemoryProjectRepository;
  readonly serverSettings: MemoryServerSettings;
  readonly hasher: PasswordHasher;
  /** RF-1102: the projects and month-to-date spend the administration list shows. */
  readonly usage: MemoryAccountUsage;
  /** RF-1006, RF-1108: the run queue, its stores and the executor the test controls. */
  readonly runs: RunHarness;
  /** The scheduler behind the SSE keep-alive; a test ticks it. */
  readonly heartbeat: ManualScheduler;
  /** The open event streams of the run routes. */
  readonly streams: StreamRegistry;
  /** RF-1104: the stored provider keys, sealed by `secretBox`. */
  readonly keys: MemoryProviderKeyRepository;
  readonly secretBox: AesGcmSecretBox;
  /** RF-1104: the DNS stand-in of the base-URL check; a test gives each host its addresses. */
  readonly resolver: FakeHostResolver;
  /** RF-407: the fake adapters the provider test was given, and the ledger it wrote to. */
  readonly providers: FakeAdapters;
  readonly providerLedger: SpyLedger;
}

export interface TestServerOptions extends Partial<
  Omit<ServerOptions, 'auth' | 'projects' | 'runs'>
> {
  /** RF-407: what the fake adapter of each provider name replays; the text answer by default. */
  readonly providerRecordings?: Readonly<Record<string, Recording>>;
  /** DEC-106: the server's default models, which the provider test uses. */
  readonly defaultRoles?: DefaultRoles;
  /** Where the run events are stored, given the server's logger; memory by default. */
  readonly eventStore?: (logger: MemoryLogger) => EventStore;
  /** The password hasher of sign-in; the fast fake by default. */
  readonly hasher?: PasswordHasher;
  /** The hash sign-in verifies for unknown user names; a fake one by default. */
  readonly dummyHash?: string;
}

interface ProjectParts {
  readonly projects: MemoryProjectRepository;
  readonly serverSettings: MemoryServerSettings;
  readonly users: MemoryUserRepository;
  readonly auditLog: MemoryAuditLog;
  readonly logger: MemoryLogger;
  readonly clock: FixedClock;
}

/** RF-010, RF-1105: the project use cases over memory adapters and predictable ids. */
function projectServices(parts: ProjectParts): ServerOptions['projects'] {
  const { projects, serverSettings, users, auditLog, logger, clock } = parts;
  const ids = new SequenceIdGenerator();
  const template = templateSettings;
  return {
    createProject: new CreateProject({ projects, serverSettings, template, ids, clock }),
    listProjects: new ListProjects({ projects }),
    getProject: new GetProject({ projects }),
    updateProjectSettings: new UpdateProjectSettings({ projects, clock }),
    openWorkspace: new OpenWorkspace({ projects, users, auditLog, logger, clock }),
  };
}

interface AuthParts {
  readonly keys: KeyParts;
  readonly testProviders: TestProviders;
  readonly serverSettings: MemoryServerSettings;
  readonly usage: MemoryAccountUsage;
  readonly users: MemoryUserRepository;
  readonly hasher: PasswordHasher;
  readonly sessions: MemorySessionStore;
  readonly auditLog: MemoryAuditLog;
  readonly logger: MemoryLogger;
  readonly clock: FixedClock;
  readonly dummyHash: string;
}

interface KeyParts {
  readonly keys: MemoryProviderKeyRepository;
  readonly secretBox: AesGcmSecretBox;
  readonly resolver: FakeHostResolver;
}

/** RF-1104: the key use cases over memory adapters and the fake resolver. */
function keyServices(parts: AuthParts) {
  const { keys, secretBox, resolver } = parts.keys;
  const base = { keys, auditLog: parts.auditLog, logger: parts.logger, clock: parts.clock };
  const hostCheck = new DnsPublicHostCheck({ resolver: resolver.resolve });
  return {
    listProviderKeys: new ListProviderKeys({ keys }),
    saveProviderKey: new SaveProviderKey({ ...base, box: secretBox, hostCheck }),
    deleteProviderKey: new DeleteProviderKey(base),
  };
}

/** RF-1106, DEC-107: the cap use cases over the memory server settings and accounts. */
function capServices(parts: AuthParts) {
  const { serverSettings: settings, users, auditLog, logger, clock } = parts;
  return {
    getCaps: new GetCaps({ settings }),
    setCaps: new SetCaps({ settings, auditLog, logger, clock }),
    getOwnDailyCap: new GetOwnDailyCap({ users }),
    setOwnDailyCap: new SetOwnDailyCap({ users, auditLog, logger, clock }),
  };
}

/** RF-1102, RF-1103, RF-1104, RF-1109: the account use cases over memory adapters. */
function accountServices(parts: AuthParts): ServerOptions['auth']['accounts'] {
  const { users, hasher, sessions, auditLog, logger, clock, usage } = parts;
  const base = { users, auditLog, logger, clock };
  return {
    changePassword: new ChangePassword({ ...base, hasher, sessions, commonPasswords }),
    createUser: new CreateUser({
      ...base,
      hasher,
      ids: new SequenceIdGenerator(),
      commonPasswords,
    }),
    updateUser: new UpdateUser({ ...base, sessions }),
    resetPassword: new ResetPassword({ ...base, hasher, sessions, commonPasswords }),
    listUsers: new ListUsers({ users, usage, clock }),
    listAudit: new ListAudit({ auditLog, clock }),
    ...keyServices(parts),
    ...capServices(parts),
    testProviders: parts.testProviders,
  };
}

interface ProviderTestParts {
  readonly users: MemoryUserRepository;
  readonly serverSettings: MemoryServerSettings;
  readonly clock: FixedClock;
  readonly logger: MemoryLogger;
  readonly masker: SecretMasker;
  readonly keys: KeyParts;
  readonly providers: FakeAdapters;
  readonly providerLedger: SpyLedger;
}

/** RF-407: the provider test over the real factory with fake adapters and the memory ledger. */
function providerTestService(parts: ProviderTestParts): TestProviders {
  const { users, serverSettings, clock, logger, masker, keys } = parts;
  const ids = new SequenceIdGenerator();
  const factory = new GuardedProviderFactory({
    ...{ keys: keys.keys, box: keys.secretBox, serverSettings, clock, ids, logger, masker },
    ...{ serverKeys: {}, ollamaUrl: 'http://localhost:11434', priceTable: budgetTable },
    ledger: parts.providerLedger,
    adapters: parts.providers.builder,
  });
  const template = templateSettings;
  return new TestProviders({
    ...{ users, serverSettings, template, factory, ids },
    unrecorded: unrecordedSinks(),
  });
}

/** RF-1009, RF-1100, RF-1101: the session use cases over memory adapters. */
function authServices(parts: AuthParts): ServerOptions['auth'] {
  const { users, hasher, sessions, auditLog, logger, clock, dummyHash } = parts;
  return {
    accounts: accountServices(parts),
    signIn: new SignIn({ users, hasher, sessions, auditLog, logger, clock, dummyHash }),
    signOut: new SignOut({ sessions, auditLog, logger, clock }),
    resolveSession: new ResolveSession({ sessions, users, logger, clock }),
    refusals: new RecordRefusedRequest({ auditLog, logger, clock }),
  };
}

/** RF-1006, RF-1108: the run use cases of the harness, with the scan start over the projects. */
function runServices(
  runs: RunHarness,
  projects: MemoryProjectRepository,
  route: Pick<ServerOptions['runs'], 'heartbeat' | 'streams'>,
): ServerOptions['runs'] {
  return {
    subscribeRunEvents: runs.subscribe,
    stopRun: runs.stop,
    startRun: new StartRun({ projects, submit: runs.submit }),
    ...route,
  };
}

/**
 * RF-1013, RF-1303, RF-1009: the HTTP server with fakes and memory adapters behind the session
 * API, for `fastify.inject`. A test may add routes before the first request; the caller closes
 * the server.
 */
export function createTestServer(options: TestServerOptions = {}): TestServer {
  const {
    hasher = new FakePasswordHasher(),
    dummyHash = 'fake$dummy',
    eventStore,
    providerRecordings,
    defaultRoles,
    ...overrides
  } = options;
  const clock = new FixedClock('2026-10-11T09:00:00.000Z');
  const masker = new SecretMasker();
  const logger = new MemoryLogger(clock, masker);
  const health = new FakeDatabaseHealth(true);
  const users = new MemoryUserRepository();
  const sessions = new MemorySessionStore();
  const audit = new MemoryAuditLog(masker);
  const auditLog = audit;
  const usage = new MemoryAccountUsage();
  const projects = new MemoryProjectRepository();
  const serverSettings = new MemoryServerSettings(defaultRoles ?? {});
  const runs = createRunHarness({
    clock,
    logger,
    ...(eventStore === undefined ? {} : { eventStore: eventStore(logger) }),
  });
  const route = { heartbeat: new ManualScheduler(() => undefined), streams: new StreamRegistry() };
  const keys = {
    keys: new MemoryProviderKeyRepository(),
    secretBox: new AesGcmSecretBox({ current: fixtureSecret(1) }),
    resolver: new FakeHostResolver(),
  };
  const providers = fakeAdapters(providerRecordings);
  const providerLedger = new SpyLedger(new MemoryCostLedger());
  const testProviders = providerTestService({
    ...{ users, serverSettings, clock, logger, masker, keys, providers, providerLedger },
  });
  const server = buildServer({
    logger,
    databaseHealth: health,
    version: testVersion,
    publicUrl: testPublicUrl,
    trustProxy: 0,
    auth: authServices({
      ...{ users, hasher, sessions, auditLog, logger, clock, dummyHash, usage, keys },
      ...{ serverSettings, testProviders },
    }),
    projects: projectServices({ projects, serverSettings, users, auditLog, logger, clock }),
    runs: runServices(runs, projects, route),
    ...overrides,
  });
  return {
    ...{ server, logger, health, clock, users, sessions, audit, hasher, usage, projects },
    ...{ serverSettings, runs, ...route, ...keys, providers, providerLedger },
  };
}
