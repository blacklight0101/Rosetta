import type { FastifyInstance } from 'fastify';
import type { PasswordHasher } from '../../src/application/ports/password-hasher.js';
import { RecordRefusedRequest } from '../../src/application/use-cases/record-refused-request.js';
import { ResolveSession } from '../../src/application/use-cases/resolve-session.js';
import { SignIn } from '../../src/application/use-cases/sign-in.js';
import { SignOut } from '../../src/application/use-cases/sign-out.js';
import { StartRun } from '../../src/application/use-cases/start-run.js';
import { CreateProject } from '../../src/application/use-cases/create-project.js';
import { GetProject } from '../../src/application/use-cases/get-project.js';
import { ListProjects } from '../../src/application/use-cases/list-projects.js';
import { OpenWorkspace } from '../../src/application/use-cases/open-workspace.js';
import { UpdateProjectSettings } from '../../src/application/use-cases/update-project-settings.js';
import { MemoryAuditLog } from '../../src/infrastructure/db/memory-audit-log.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import { MemorySessionStore } from '../../src/infrastructure/db/memory-session-store.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { StreamRegistry } from '../../src/presentation/web/event-stream.js';
import { buildServer, type ServerOptions } from '../../src/presentation/web/server.js';
import { FakePasswordHasher } from './account-fixtures.js';
import { FakeDatabaseHealth } from './fake-database-health.js';
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
  /** RF-1006, RF-1108: the run queue, its stores and the executor the test controls. */
  readonly runs: RunHarness;
  /** The scheduler behind the SSE keep-alive; a test ticks it. */
  readonly heartbeat: ManualScheduler;
  /** The open event streams of the run routes. */
  readonly streams: StreamRegistry;
}

export interface TestServerOptions extends Partial<
  Omit<ServerOptions, 'auth' | 'projects' | 'runs'>
> {
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
  readonly users: MemoryUserRepository;
  readonly hasher: PasswordHasher;
  readonly sessions: MemorySessionStore;
  readonly auditLog: MemoryAuditLog;
  readonly logger: MemoryLogger;
  readonly clock: FixedClock;
  readonly dummyHash: string;
}

/** RF-1009, RF-1100, RF-1101: the session use cases over memory adapters. */
function authServices(parts: AuthParts): ServerOptions['auth'] {
  const { users, hasher, sessions, auditLog, logger, clock, dummyHash } = parts;
  return {
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
  const projects = new MemoryProjectRepository();
  const serverSettings = new MemoryServerSettings({});
  const runs = createRunHarness({
    clock,
    logger,
    ...(eventStore === undefined ? {} : { eventStore: eventStore(logger) }),
  });
  const route = { heartbeat: new ManualScheduler(() => undefined), streams: new StreamRegistry() };
  const server = buildServer({
    logger,
    databaseHealth: health,
    version: testVersion,
    publicUrl: testPublicUrl,
    trustProxy: 0,
    auth: authServices({ users, hasher, sessions, auditLog, logger, clock, dummyHash }),
    projects: projectServices({ projects, serverSettings, users, auditLog, logger, clock }),
    runs: runServices(runs, projects, route),
    ...overrides,
  });
  return {
    server,
    logger,
    health,
    clock,
    users,
    sessions,
    audit,
    hasher,
    projects,
    serverSettings,
    runs,
    ...route,
  };
}
