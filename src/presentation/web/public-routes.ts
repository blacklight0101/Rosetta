import type { FastifyInstance } from 'fastify';
import type { DatabaseHealth } from '../../application/ports/database-health.js';
import { robotsTxt } from './security-headers.js';

export interface PublicRouteOptions {
  readonly databaseHealth: DatabaseHealth;
  /** The Rosetta version from package.json. */
  readonly version: string;
}

/**
 * The routes that need no session (CLAUDE.md, DEC-62): RF-1303 `GET /healthz`, 200 with the
 * version when the database answers and otherwise 503 with no detail; RF-1201 `GET /robots.txt`.
 */
export function registerPublicRoutes(server: FastifyInstance, options: PublicRouteOptions): void {
  const { databaseHealth, version } = options;

  server.get('/healthz', { config: { access: 'public' } }, async (_request, reply) => {
    const reachable = await databaseHealth.isReachable().catch(() => false);
    if (!reachable) return reply.status(503).send();
    return reply.status(200).send({ status: 'ok', version });
  });

  server.get('/robots.txt', { config: { access: 'public' } }, (_request, reply) =>
    reply.status(200).type('text/plain; charset=utf-8').send(robotsTxt),
  );
}
