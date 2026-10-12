import type { FastifyInstance } from 'fastify';
import type { PasswordHasher } from '../../src/application/ports/password-hasher.js';
import { RecordRefusedRequest } from '../../src/application/use-cases/record-refused-request.js';
import { ResolveSession } from '../../src/application/use-cases/resolve-session.js';
import { SignIn } from '../../src/application/use-cases/sign-in.js';
import { SignOut } from '../../src/application/use-cases/sign-out.js';
import { MemoryAuditLog } from '../../src/infrastructure/db/memory-audit-log.js';
import { MemorySessionStore } from '../../src/infrastructure/db/memory-session-store.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { buildServer, type ServerOptions } from '../../src/presentation/web/server.js';
import { FakePasswordHasher } from './account-fixtures.js';
import { FakeDatabaseHealth } from './fake-database-health.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';

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
  readonly hasher: PasswordHasher;
}

export interface TestServerOptions extends Partial<Omit<ServerOptions, 'auth'>> {
  /** The password hasher of sign-in; the fast fake by default. */
  readonly hasher?: PasswordHasher;
  /** The hash sign-in verifies for unknown user names; a fake one by default. */
  readonly dummyHash?: string;
}

/**
 * RF-1013, RF-1303, RF-1009: the HTTP server with fakes and memory adapters behind the session
 * API, for `fastify.inject`. A test may add routes before the first request; the caller closes
 * the server.
 */
export function createTestServer(options: TestServerOptions = {}): TestServer {
  const { hasher = new FakePasswordHasher(), dummyHash = 'fake$dummy', ...overrides } = options;
  const clock = new FixedClock('2026-10-11T09:00:00.000Z');
  const masker = new SecretMasker();
  const logger = new MemoryLogger(clock, masker);
  const health = new FakeDatabaseHealth(true);
  const users = new MemoryUserRepository();
  const sessions = new MemorySessionStore();
  const audit = new MemoryAuditLog(masker);
  const auditLog = audit;
  const server = buildServer({
    logger,
    databaseHealth: health,
    version: testVersion,
    publicUrl: testPublicUrl,
    trustProxy: 0,
    auth: {
      signIn: new SignIn({ users, hasher, sessions, auditLog, logger, clock, dummyHash }),
      signOut: new SignOut({ sessions, auditLog, logger, clock }),
      resolveSession: new ResolveSession({ sessions, users, logger, clock }),
      refusals: new RecordRefusedRequest({ auditLog, logger, clock }),
    },
    ...overrides,
  });
  return { server, logger, health, clock, users, sessions, audit, hasher };
}
