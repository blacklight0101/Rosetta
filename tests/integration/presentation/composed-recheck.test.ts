import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { LlmProvider, LlmResponse } from '../../../src/application/ports/llm-provider.js';
import { acceptedManifest } from '../../../src/application/runs/accepted-manifest.js';
import { scopeOf } from '../../../src/application/runs/run-scope.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { PgProjectRepository } from '../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../src/infrastructure/db/pg-run-index.js';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { FileRunManifestStore } from '../../../src/infrastructure/files/file-run-manifest-store.js';
import { NodeOutputWriter } from '../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { TestDoubles } from '../../../src/presentation/test-doubles.js';
import { fixturePassword } from '../../support/account-fixtures.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { hasTestDatabase, useTestDatabase, type TestDatabase } from '../../support/postgres.js';
import { settingsFor } from '../../support/provider-factory-harness.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';
import { sampleZip } from '../../support/upload-store-harness.js';
import { removeWritableTree } from '../../support/writable-temp-root.js';

// RF-132, DEC-151: the composed application, not a hand-wired one. A run of an upload project is
// queued with local roles, the roles are then switched to a cloud provider, and when the queue
// starts the run it must end `Failed` with RST-1521 without one call to a provider. Only this test
// proves that the composition root wraps the understand executor with the re-check.

const origin = 'http://127.0.0.1:8080';
const admin = ['recheck', 'admin'].join('.');
const folders: string[] = [];

afterAll(async () => {
  await Promise.all(folders.map((folder) => removeWritableTree(folder)));
});

const sessionBody = z.object({ csrfToken: z.string() });
const idBody = z.object({ id: z.string() });
const endedBody = z.object({
  type: z.literal('run.ended'),
  data: z.looseObject({ endState: z.string() }),
});

/** A provider double that counts its calls and answers none. */
class CountingProvider implements LlmProvider {
  calls = 0;

  complete(): Promise<LlmResponse> {
    this.calls += 1;
    return Promise.reject(new Error('No provider call is expected in this test.'));
  }
}

async function signedIn(address: string, password: string) {
  const cookies = new Map<string, string>();
  const keep = (response: Response): void => {
    for (const line of response.headers.getSetCookie()) {
      const [pair = ''] = line.split(';');
      const [name = '', ...value] = pair.split('=');
      cookies.set(name, value.join('='));
    }
  };
  const first = await fetch(`${address}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ userName: admin, password }),
  });
  keep(first);
  const csrf = sessionBody.parse(await first.json()).csrfToken;
  return (path: string, init: RequestInit & { type?: string; name?: string } = {}) =>
    fetch(`${address}${path}`, {
      ...init,
      headers: {
        cookie: [...cookies].map(([n, v]) => `${n}=${v}`).join('; '),
        origin,
        'x-csrf-token': csrf,
        ...(init.type === undefined ? {} : { 'content-type': init.type }),
        ...(init.name === undefined ? {} : { 'x-file-name': init.name }),
      },
    });
}

/** The `run.ended` events found under the data folder, as parsed. */
async function endedEvents(folder: string): Promise<readonly z.infer<typeof endedBody>[]> {
  const found: z.infer<typeof endedBody>[] = [];
  for (const entry of await readdir(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name !== 'events.jsonl') continue;
    const text = await readFile(join(entry.parentPath, entry.name), 'utf8');
    for (const line of text.split('\n').filter((each) => each !== '')) {
      const parsed = endedBody.safeParse(JSON.parse(line));
      if (parsed.success) found.push(parsed.data);
    }
  }
  return found;
}

async function waitFor<T>(read: () => Promise<T | undefined>): Promise<T | undefined> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return undefined;
}

type Send = Awaited<ReturnType<typeof signedIn>>;

interface Setup {
  readonly pool: ConstructorParameters<typeof PgRunIndex>[0];
  readonly send: Send;
  readonly provider: CountingProvider;
  readonly dataDir: string;
  readonly stop: () => Promise<unknown>;
}

async function startComposed(database: TestDatabase): Promise<Setup> {
  const schema = await database.createSchema({ migrate: true });
  const dataDir = await mkdtemp(join(tmpdir(), 'rst-composed-recheck-'));
  folders.push(dataDir);
  const password = fixturePassword('Recheck');
  const environment = loadEnvironment({
    DATABASE_URL: schema.url,
    ROSETTA_SECRET_KEY: fixtureSecret(12),
    ROSETTA_PUBLIC_URL: origin,
    ROSETTA_DATA_DIR: dataDir,
    ROSETTA_ADMIN_USER: admin,
    ROSETTA_ADMIN_PASSWORD: password,
    ROSETTA_TEST: '1',
  });
  const provider = new CountingProvider();
  const application = composeApplication({
    environment,
    listen: { host: '127.0.0.1', port: 0 },
    output: { write: () => true },
    doubles: TestDoubles.create(environment, { provider }),
  });
  const address = await application.start();
  await schema.pool.query("UPDATE users SET state = 'Active'");
  const send = await signedIn(address, password);
  return { pool: schema.pool, send, provider, dataDir, stop: () => application.stop() };
}

/** An upload project of the signed-in user, with its zip. */
async function uploadProject(setup: Setup) {
  const created = await setup.send('/api/projects', {
    method: 'POST',
    type: 'application/json',
    body: JSON.stringify({ sourceKind: 'upload', name: 'OrderDesk' }),
  });
  const id = idBody.parse(await created.json()).id;
  await setup.send(`/api/projects/${id}/source`, {
    method: 'PUT',
    type: 'application/zip',
    name: 'orders.zip',
    body: new Uint8Array(await sampleZip()),
  });
  const userId = idBody.parse((await setup.pool.query('SELECT id FROM users')).rows[0]).id;
  const projects = new PgProjectRepository(setup.pool);
  const project = await projects.find(userId, id);
  if (project === undefined) throw new Error('The project is missing');
  return { projects, project, userId };
}

/** An understand run waiting in the queue, accepted with the local roles of the project. */
async function queueRun(setup: Setup, owner: Awaited<ReturnType<typeof uploadProject>>) {
  const { project, userId } = owner;
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const masker = new SecretMasker();
  const writer = new NodeOutputWriter({
    dataDir: setup.dataDir,
    logger: new MemoryLogger(clock, masker),
  });
  const run: Run = {
    id: crypto.randomUUID(),
    projectId: project.id,
    userId,
    runKey: '20260101-000000-understand',
    stage: 'understand',
    commitSha: null,
    snapshotKey: null,
    queueState: 'Queued',
    endState: null,
    queuedAt: 1,
    startedAt: null,
    endedAt: null,
    totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    failedAreas: 0,
  };
  await new PgRunIndex(setup.pool).insert(run);
  const accepted = acceptedManifest({
    ...{ run, project, rosettaVersion: '1.2.3-test' },
    options: { cloudConsent: true },
  });
  await new FileRunManifestStore({ writer, masker }).write(scopeOf(run), accepted);
  return run;
}

const cloudRoles = settingsFor({
  reader: { provider: 'openai', model: 'gpt-5-mini' },
  verifier: { provider: 'openai', model: 'gpt-5-mini' },
  summariser: { provider: 'openai', model: 'gpt-5-mini' },
});

describe.skipIf(!hasTestDatabase)('a queued run in the composed application', () => {
  const database = useTestDatabase();

  it('RF-132 DEC-151 a queued run whose roles went to a cloud provider ends Failed with RST-1521 and calls no provider', async () => {
    const setup = await startComposed(database);
    try {
      const owner = await uploadProject(setup);
      const run = await queueRun(setup, owner);
      // Before it starts the roles move to a cloud provider; a scan run then makes the queue dispatch.
      await owner.projects.updateSettings({
        ...{ userId: owner.userId, projectId: owner.project.id, settings: cloudRoles },
        updatedAt: Date.now(),
        expectedVersion: undefined,
      });
      await setup.send(`/api/projects/${owner.project.id}/runs`, {
        method: 'POST',
        type: 'application/json',
        body: JSON.stringify({ stage: 'scan' }),
      });
      const ended = await waitFor(async () => {
        const sql = 'SELECT end_state FROM runs WHERE id = $1';
        const rows = await setup.pool.query<{ end_state: string | null }>(sql, [run.id]);
        return rows.rows[0]?.end_state ?? undefined;
      });
      const events = await endedEvents(setup.dataDir);

      expect(ended).toBe('Failed');
      expect(JSON.stringify(events)).toContain('RST-1521');
      expect(setup.provider.calls).toBe(0);
    } finally {
      await setup.stop();
    }
  }, 60_000);
});
