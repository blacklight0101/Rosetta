import type { FastifyInstance } from 'fastify';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { buildServer, type ServerOptions } from '../../src/presentation/web/server.js';
import { FakeDatabaseHealth } from './fake-database-health.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';

/** The version the test servers report on /healthz. */
export const testVersion = '1.2.3-test';

export interface TestServer {
  readonly server: FastifyInstance;
  readonly logger: MemoryLogger;
  readonly health: FakeDatabaseHealth;
}

/**
 * RF-1013, RF-1303: the HTTP server with fakes, for `fastify.inject`. A test may add routes before
 * the first request; the caller closes the server.
 */
export function createTestServer(overrides: Partial<ServerOptions> = {}): TestServer {
  const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
  const health = new FakeDatabaseHealth(true);
  const server = buildServer({
    logger,
    databaseHealth: health,
    version: testVersion,
    publicUrl: 'http://127.0.0.1:8080',
    trustProxy: 0,
    ...overrides,
  });
  return { server, logger, health };
}
