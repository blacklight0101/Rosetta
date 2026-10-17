import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { PgProjectRepository } from '../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../src/infrastructure/db/pg-run-index.js';
import type { DatabasePool } from '../../../src/infrastructure/db/pool.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { fixturePassword } from '../../support/account-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { sampleProject } from '../../support/project-fixtures.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';
import { sampleRun } from '../../support/run-fixtures.js';
import { connectSse } from '../../support/sse-client.js';

// RF-1101, P1-160: in the composed application (real composition root, PostgreSQL), signing out
// ends an event stream opened through the composed run routes: the run routes and the session
// store share one stream registry.

const publicUrl = 'http://127.0.0.1:8080';
const adminName = ['stream', 'admin'].join('.');
const folders: string[] = [];

afterAll(async () => {
  await Promise.all(
    folders.map((folder) =>
      rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    ),
  );
});

/** The cookies a browser keeps, updated from each answer. */
class Jar {
  readonly cookies = new Map<string, string>();
  token = '';

  async send(url: string, init: { method: string; body?: unknown }): Promise<Response> {
    const response = await fetch(url, {
      method: init.method,
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        origin: publicUrl,
        cookie: this.header(),
        'x-csrf-token': this.token,
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(20_000),
    });
    this.keep(response);
    if (response.status === 200) this.keepToken(await response.json());
    return response;
  }

  private keep(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      const [pair = ''] = line.split(';');
      const [name = '', value = ''] = pair.split('=');
      this.cookies.set(name, value);
    }
  }

  private keepToken(body: unknown): void {
    const token: unknown =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'csrfToken') : undefined;
    if (typeof token === 'string') this.token = token;
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

async function runningRunOf(pool: DatabasePool, userId: string): Promise<string> {
  const project = sampleProject({ userId });
  await new PgProjectRepository(pool).insertOrFind(project);
  const index = new PgRunIndex(pool);
  const queued = sampleRun({ userId, projectId: project.id });
  await index.insert(queued);
  await index.start(queued.id, queued.queuedAt + 1_000);
  return queued.id;
}

const [first, second] = [fixturePassword('First'), fixturePassword('Second')];

function composed(databaseUrl: string, dataDir: string) {
  return composeApplication({
    environment: loadEnvironment({
      DATABASE_URL: databaseUrl,
      ROSETTA_SECRET_KEY: fixtureSecret(6),
      ROSETTA_PUBLIC_URL: publicUrl,
      ROSETTA_DATA_DIR: dataDir,
      ROSETTA_ADMIN_USER: adminName,
      ROSETTA_ADMIN_PASSWORD: first,
    }),
    listen: { host: '127.0.0.1', port: 0 },
    output: { write: () => true },
  });
}

/** Signs the bootstrap administrator in and changes the first password, as the browser would. */
async function signedIn(address: string): Promise<Jar> {
  const jar = new Jar();
  const signIn = await jar.send(`${address}/api/session`, {
    method: 'POST',
    body: { userName: adminName, password: first },
  });
  const change = await jar.send(`${address}/api/account/password`, {
    method: 'POST',
    body: { currentPassword: first, newPassword: second },
  });
  if (signIn.status !== 200 || change.status !== 200) throw new Error('sign-in failed');
  return jar;
}

describe.skipIf(!hasTestDatabase)('event streams in the composed application', () => {
  const database = useTestDatabase();

  it('RF-1101 signing out ends a stream opened through the composed run routes', async () => {
    const schema = await database.createSchema({ migrate: true });
    const dataDir = await mkdtemp(join(tmpdir(), 'rst-stream-'));
    folders.push(dataDir);
    const application = composed(schema.url, dataDir);

    try {
      const address = await application.start();
      const jar = await signedIn(address);
      const users = await schema.pool.query<{ id: string }>('SELECT id FROM users');
      const runId = await runningRunOf(schema.pool, users.rows[0]?.id ?? '');
      const stream = await connectSse(`${address}/api/runs/${runId}/events`, {
        cookie: jar.header(),
      });
      await stream.waitFor('retry:');
      let ended = false;
      void stream.ended.then(() => {
        ended = true;
      });

      const signOut = await jar.send(`${address}/api/session`, { method: 'DELETE' });

      expect(stream.status).toBe(200);
      expect(signOut.status).toBe(204);
      await expect.poll(() => ended, { timeout: 15_000 }).toBe(true);
    } finally {
      await application.stop();
    }
  }, 60_000);
});
