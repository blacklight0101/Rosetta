import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { recordRoutesOf } from '../../support/route-recorder.js';

// RF-1105: the record the access matrix compares with its rows must hold every route, wildcards
// included, whatever their method: the printed route listing of Fastify loses the path before a
// wildcard, so a wildcard route with no matrix row used to pass unseen.

async function rowsOf(register: (server: FastifyInstance) => void) {
  const server = Fastify();
  const recorder = recordRoutesOf(server);
  register(server);
  await server.ready();
  return recorder.rows();
}

describe('recordRoutesOf', () => {
  it('RF-1105 holds a GET route with its HEAD form, whole url', async () => {
    const rows = await rowsOf((server) => server.get('/api/session', () => 'ok'));

    expect(rows).toEqual(['GET /api/session', 'HEAD /api/session']);
  });

  it('RF-1105 holds wildcard routes of any method with the path before the wildcard', async () => {
    const rows = await rowsOf((server) => {
      server.get('/runs/:runId/files/*', () => 'ok');
      server.get('/secret/*', () => 'ok');
      server.post('/other/*', () => 'ok');
    });

    expect(rows).toEqual([
      'GET /runs/:runId/files/*',
      'GET /secret/*',
      'HEAD /runs/:runId/files/*',
      'HEAD /secret/*',
      'POST /other/*',
    ]);
  });

  it('RF-1105 holds a route of a plugin and a route with several methods', async () => {
    const rows = await rowsOf((server) => {
      void server.register((instance, _options, done) => {
        instance.route({ method: ['PUT', 'DELETE'], url: '/nested/:id', handler: () => 'ok' });
        done();
      });
    });

    expect(rows).toEqual(['DELETE /nested/:id', 'PUT /nested/:id']);
  });
});
