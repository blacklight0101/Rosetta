import type { FastifyInstance } from 'fastify';
import type { UploadStore } from '../../src/application/ports/upload-store.js';
import type { DefaultRoles } from '../../src/application/projects/default-roles.js';
import type { PasswordHasher } from '../../src/application/ports/password-hasher.js';
import type { SessionStore } from '../../src/application/ports/session-store.js';
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
import type { TestProviders } from '../../src/application/use-cases/test-providers.js';
import type { MemoryAccountUsage } from '../../src/infrastructure/db/memory-account-usage.js';
import { MemoryAuditLog } from '../../src/infrastructure/db/memory-audit-log.js';
import type { MemoryCostTotals } from '../../src/infrastructure/db/memory-cost-totals.js';
import type { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import type { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import type { MemorySessionStore } from '../../src/infrastructure/db/memory-session-store.js';
import type { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import type { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import type { AesGcmSecretBox } from '../../src/infrastructure/security/aes-gcm-secret-box.js';
import { DnsPublicHostCheck } from '../../src/infrastructure/security/public-host-check.js';
import { DeleteProviderKey } from '../../src/application/use-cases/delete-provider-key.js';
import { ListProviderKeys } from '../../src/application/use-cases/list-provider-keys.js';
import { SaveProviderKey } from '../../src/application/use-cases/save-provider-key.js';
import type { StreamRegistry } from '../../src/presentation/web/event-stream.js';
import { buildServer, type ServerOptions } from '../../src/presentation/web/server.js';
import { commonPasswords, FakePasswordHasher } from './account-fixtures.js';
import type { MemoryArchiveWriter } from './memory-archive-writer.js';
import type { MemoryRunFileReader } from './memory-run-file-reader.js';
import type { RecordingReportWriter } from './report-doubles.js';
import { FakeDatabaseHealth } from './fake-database-health.js';
import type { FakeHostResolver } from './fake-host-resolver.js';
import type { FakeAdapters, SpyLedger } from './provider-fakes.js';
import { providerTestService } from './web-provider-test.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { answerStore, observabilityStore } from './observability-store.js';
import type { MemoryOutputWriter } from './memory-output-writer.js';
import type { ManualScheduler } from './manual-scheduler.js';
import { capServices } from './cap-services.js';
import { FakeUploadStore } from './fake-upload-store.js';
import { projectServices, type UploadParts } from './project-services.js';
import { historyServices, runServices, type RunOutputGiven } from './web-run-services.js';
import {
  keyParts,
  memoryStores,
  outputsAndRoutes,
  streamRoute,
  type HistoryDoubles,
  type KeyParts,
} from './web-server-parts.js';
import { createRunHarness, type EventStore, type RunHarness } from './run-harness.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

/** The version the test servers report on /healthz. */
export const testVersion = '1.2.3-test';

/** RF-129: the upload limit of a test server that does not set one. */
const DEFAULT_TEST_UPLOAD_MB = 5;
const BYTES_PER_MB = 1024 * 1024;

/** The public URL of the test servers; state-changing requests send it as their Origin. */
export const testPublicUrl = 'http://127.0.0.1:8080';

export interface TestServer extends HistoryDoubles {
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
  /** RF-1105: every route the server registered, as "METHOD url" (see route-recorder.ts). */
  readonly routes: () => readonly string[];
  /** RF-1102: the projects and month-to-date spend the administration list shows. */
  readonly usage: MemoryAccountUsage;
  /** RF-428, RF-1010: the ledger rows the cost page and the totals pill sum; a test adds them. */
  readonly costs: MemoryCostTotals;
  /** RF-1006, RF-1108: the run queue, its stores and the executor the test controls. */
  readonly runs: RunHarness;
  /** RF-008: the run folders the default export reads; give a run its folder with `seed`. */
  readonly archives: MemoryArchiveWriter;
  /** RF-506: the run folders the default file reader reads; give a run its folder with `seed`. */
  readonly runFiles: MemoryRunFileReader;
  /** RF-504: the models the default report writer was asked to write. */
  readonly reportWriter: RecordingReportWriter;
  /** RF-1007: the projects' answers.md files the answer routes read and write, in `answerFiles`. */
  readonly answers: FileAnswersFile;
  readonly answerFiles: MemoryOutputWriter;
  /** RF-1011: the run folders the call log and transcript routes read; `seedCallLog` fills them. */
  readonly callFiles: MemoryOutputWriter;
  /** RF-605: the projects' planning-brief.json files the planning brief routes read and write. */
  readonly briefFiles: MemoryOutputWriter;
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

/** `archiveWriter`, `runFileReader` and `report` replace the memory doubles of the run outputs. */
export interface TestServerOptions
  extends Partial<Omit<ServerOptions, 'auth' | 'projects' | 'runs'>>, RunOutputGiven {
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
  /** RF-128: where uploads go; a fake that keeps nothing by default. The limit is `uploadMaxMb` (5 MB when not given). */
  readonly uploads?: UploadStore;
  /** RF-1011: a data folder makes the calls and logs routes the composition root's, over its logs. */
  readonly logDir?: string;
}

interface AuthParts {
  readonly keys: KeyParts;
  readonly testProviders: TestProviders;
  readonly serverSettings: MemoryServerSettings;
  readonly usage: MemoryAccountUsage;
  readonly users: MemoryUserRepository;
  readonly hasher: PasswordHasher;
  readonly sessions: SessionStore;
  readonly auditLog: MemoryAuditLog;
  readonly logger: MemoryLogger;
  readonly clock: FixedClock;
  readonly dummyHash: string;
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

function runHarnessOf(
  clock: FixedClock,
  logger: MemoryLogger,
  eventStore: TestServerOptions['eventStore'],
  projects: MemoryProjectRepository,
): RunHarness {
  const harness = createRunHarness({
    clock,
    logger,
    ...(eventStore === undefined ? {} : { eventStore: eventStore(logger) }),
  });
  projects.followRuns(harness.runs);
  return harness;
}

/** The observability and answer files of a test server, the key stores and what the run routes read. */
function fileDoubles(parts: {
  readonly projects: MemoryProjectRepository;
  readonly clock: FixedClock;
  readonly masker: SecretMasker;
  readonly logDir: string | undefined;
  readonly logger: MemoryLogger;
}) {
  const { masker, logger } = parts;
  const files = { ...answerStore(masker), ...observabilityStore(masker, logger) };
  return { files, keys: keyParts(), stores: { ...parts, ...files } };
}

/** RF-128, RF-129: the store uploads go to (a fake by default) and the limit it is given. */
function uploadPartsOf(options: TestServerOptions): UploadParts {
  const { uploads = new FakeUploadStore(), uploadMaxMb = DEFAULT_TEST_UPLOAD_MB } = options;
  return { store: uploads, limitBytes: uploadMaxMb * BYTES_PER_MB };
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
    archiveWriter,
    runFileReader,
    report,
    providerRecordings,
    defaultRoles,
    logDir,
    ...overrides
  } = options;
  const clock = new FixedClock('2026-10-11T09:00:00.000Z');
  const [masker, health] = [new SecretMasker(), new FakeDatabaseHealth(true)];
  const logger = new MemoryLogger(clock, masker);
  const { users, sessions, usage, projects, costs, folders, snapshots } = memoryStores();
  const { route, endingSessions } = streamRoute(clock, sessions);
  const auditLog = new MemoryAuditLog(masker);
  const serverSettings = new MemoryServerSettings(defaultRoles ?? {});
  const runs = runHarnessOf(clock, logger, eventStore, projects);
  const { outputs, recorder, doubles } = outputsAndRoutes({ archiveWriter, runFileReader, report });
  const { files, keys, stores } = fileDoubles({ projects, clock, masker, logDir, logger });
  const { providers, providerLedger, testProviders, factory } = providerTestService({
    ...{ users, serverSettings, clock, logger, masker, keys, recordings: providerRecordings },
  });
  const upload = uploadPartsOf(options);
  const projectParts = { projects, serverSettings, users, auditLog, logger, clock, costs, usage };
  const server = buildServer({
    logger,
    databaseHealth: health,
    version: testVersion,
    publicUrl: testPublicUrl,
    trustProxy: 0,
    auth: authServices({
      ...{ users, hasher, auditLog, logger, clock, dummyHash, usage, keys },
      ...{ sessions: endingSessions, serverSettings, testProviders },
    }),
    projects: projectServices(projectParts, { ...files, keys: keys.keys }, runs.runs, upload),
    runs: runServices(runs, { ...stores, keys: keys.keys, users, factory }, route, outputs),
    history: historyServices({ runs, projects, folders, snapshots, logger, costs, upload }),
    onRoute: recorder.onRoute,
    ...overrides,
  });
  return {
    ...{ server, logger, health, clock, users, sessions, audit: auditLog, hasher, usage, projects },
    ...{ serverSettings, runs, ...doubles, ...files, ...route, ...keys },
    ...{ costs, providers, providerLedger, folders, snapshots },
  };
}
