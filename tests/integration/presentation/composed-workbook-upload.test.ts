import { mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import {
  composeApplication,
  type ApplicationOptions,
} from '../../../src/presentation/composition-root.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { fixturePassword } from '../../support/account-fixtures.js';
import { hasTestDatabase, useTestDatabase, type TestDatabase } from '../../support/postgres.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';
import { sampleBook, stagedNames } from '../../support/workbook-staging-harness.js';
import { removeWritableTree } from '../../support/writable-temp-root.js';

// RF-150, RF-157, RF-134, RFC-005 section 4.2: the composed application, not a hand-wired one. A batch
// of workbooks is opened, filled and finished over HTTP, the session tells the page the workbook limit,
// a staging folder left by a restart is deleted at start-up, and deleting the project takes its
// snapshot with it. The wirings only proved here: the batch use case in the projects services, the
// staging area over the data folder, the limit in the session, the start-up sweep and the deletion.

const origin = 'http://127.0.0.1:8080';
const admin = ['workbook', 'admin'].join('.');
const folders: string[] = [];

afterAll(async () => {
  await Promise.all(folders.map((folder) => removeWritableTree(folder)));
});

const sessionBody = z.object({ csrfToken: z.string(), workbookMaxFiles: z.number().optional() });
const idBody = z.object({ id: z.string() });
const batchBody = z.object({ batchId: z.string() });
const finishBody = z.object({
  workbooks: z.array(z.object({ name: z.string(), sheets: z.number() })),
  snapshotHash: z.string(),
});
const stateBody = z.object({ phase: z.string(), summary: finishBody.optional() });

/** A signed-in client of the started application: cookies kept by hand, as a browser does. */
async function signedIn(address: string, password: string) {
  const cookies = new Map<string, string>();
  const first = await fetch(`${address}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ userName: admin, password }),
  });
  for (const line of first.headers.getSetCookie()) {
    const [pair = ''] = line.split(';');
    const [name = '', ...value] = pair.split('=');
    cookies.set(name, value.join('='));
  }
  const csrf = sessionBody.parse(await first.json()).csrfToken;
  const cookie = [...cookies].map(([n, v]) => `${n}=${v}`).join('; ');
  const send = (
    path: string,
    init: RequestInit & { type?: string; name?: string } = {},
  ): Promise<Response> =>
    fetch(`${address}${path}`, {
      ...init,
      headers: {
        cookie,
        origin,
        'x-csrf-token': csrf,
        ...(init.type === undefined ? {} : { 'content-type': init.type }),
        ...(init.name === undefined ? {} : { 'x-file-name': init.name }),
      },
    });
  return { send };
}

async function workbookFolders(dataDir: string): Promise<string[]> {
  const found = await readdir(join(dataDir, 'sources')).catch(() => []);
  return found.filter((name) => name.startsWith('workbook__'));
}

async function composed(
  database: TestDatabase,
  leftover = false,
  batchTimers?: ApplicationOptions['batchTimers'],
) {
  const schema = await database.createSchema({ migrate: true });
  const dataDir = await mkdtemp(join(tmpdir(), 'rst-composed-workbook-'));
  folders.push(dataDir);
  if (leftover)
    await mkdir(join(dataDir, 'sources', '.partial-batch-left-by-a-restart'), { recursive: true });
  const password = fixturePassword('Composed');
  const application = composeApplication({
    environment: loadEnvironment({
      DATABASE_URL: schema.url,
      ROSETTA_SECRET_KEY: fixtureSecret(12),
      ROSETTA_PUBLIC_URL: origin,
      ROSETTA_DATA_DIR: dataDir,
      ROSETTA_ADMIN_USER: admin,
      ROSETTA_ADMIN_PASSWORD: password,
      ROSETTA_UPLOAD_MAX_MB: '7',
      ROSETTA_WORKBOOK_MAX_FILES: '3',
    }),
    listen: { host: '127.0.0.1', port: 0 },
    output: { write: () => true },
    ...(batchTimers === undefined ? {} : { batchTimers }),
  });
  return { application, password, dataDir, pool: schema.pool };
}

const database = useTestDatabase();

type Send = Awaited<ReturnType<typeof signedIn>>['send'];

/** A workbook project with a batch open: the project id, the batch routes and the batch id. */
async function openedBatch(send: Send, name: string) {
  const created = await send('/api/projects', {
    method: 'POST',
    type: 'application/json',
    body: JSON.stringify({ sourceKind: 'workbook', name }),
  });
  const id = idBody.parse(await created.json()).id;
  const base = `/api/projects/${id}/source/batches`;
  const opened = batchBody.parse(await (await send(base, { method: 'POST' })).json());
  return { id, base, batchId: opened.batchId };
}

async function putBook(send: Send, batch: { base: string; batchId: string }, name: string) {
  return send(`${batch.base}/${batch.batchId}/files`, {
    method: 'PUT',
    type: 'application/octet-stream',
    name: encodeURIComponent(name),
    body: new Uint8Array(await sampleBook()),
  });
}

/** RF-159: the summary the state of the batch gives once the work after the finish has ended. */
async function summaryOf(send: Send, path: string): Promise<z.output<typeof finishBody>> {
  for (let turn = 0; turn < 400; turn += 1) {
    const state = stateBody.parse(await (await send(path)).json());
    if (state.summary !== undefined) return state.summary;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('the batch did not end');
}

describe.skipIf(!hasTestDatabase)('the composed application and a batch of workbooks', () => {
  it('RF-150 RF-157 takes a batch, publishes its snapshot, shows the source and deletes it with the project', async () => {
    const { application, password, dataDir, pool } = await composed(database);
    try {
      const address = await application.start();
      await pool.query("UPDATE users SET state = 'Active'");
      const { send } = await signedIn(address, password);
      const session = sessionBody.parse(await (await send('/api/session')).json());
      const batch = await openedBatch(send, 'Pricing');
      const files = [await putBook(send, batch, 'A.xlsx'), await putBook(send, batch, 'B.xlsx')];
      const finished = await send(`${batch.base}/${batch.batchId}/finish`, { method: 'POST' });
      const summary = await summaryOf(send, `${batch.base}/${batch.batchId}`);
      const shown: unknown = await (await send(`/api/projects/${batch.id}`)).json();
      const stored = await workbookFolders(dataDir);
      const deleted = await send(`/api/projects/${batch.id}`, { method: 'DELETE' });

      expect(session.workbookMaxFiles).toBe(3);
      expect(files.map((file) => file.status)).toEqual([201, 201]);
      expect(finished.status).toBe(202);
      expect(summary.workbooks.map((workbook) => workbook.name)).toEqual(['A.xlsx', 'B.xlsx']);
      expect(stored).toEqual([`workbook__${batch.id}@${summary.snapshotHash.slice(7, 23)}`]);
      expect(shown).toMatchObject({ source: { workbooks: 2 }, sourceKind: 'workbook' });
      expect(deleted.status).toBe(200);
      expect(await workbookFolders(dataDir)).toEqual([]);
    } finally {
      await application.stop();
    }
  });
});

describe.skipIf(!hasTestDatabase)('the composed application and the limits of a batch', () => {
  it('RF-150 refuses the file past ROSETTA_WORKBOOK_MAX_FILES, the limit the composition root gives the batch', async () => {
    const { application, password, pool } = await composed(database);
    try {
      const address = await application.start();
      await pool.query("UPDATE users SET state = 'Active'");
      const { send } = await signedIn(address, password);
      const batch = await openedBatch(send, 'Many');

      const statuses = [];
      for (const name of ['A.xlsx', 'B.xlsx', 'C.xlsx', 'D.xlsx']) {
        statuses.push((await putBook(send, batch, name)).status);
      }

      expect(statuses).toEqual([201, 201, 201, 400]);
    } finally {
      await application.stop();
    }
  });
});

describe.skipIf(!hasTestDatabase)('the composed application and a restart', () => {
  it('RF-150 deletes a staging folder that a restart left behind when the application starts', async () => {
    const { application, dataDir } = await composed(database, true);
    try {
      expect(await readdir(join(dataDir, 'sources'))).toEqual(['.partial-batch-left-by-a-restart']);

      await application.start();

      expect(await readdir(join(dataDir, 'sources'))).toEqual([]);
    } finally {
      await application.stop();
    }
  });
});

/** A file whose body sends a few bytes and then never ends: a client that went away without closing. */
function hangingBody(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
    },
  });
}

describe.skipIf(!hasTestDatabase)('the composed application and a shutdown', () => {
  it('RF-1108 DEC-149 stops a file that is arriving and deletes the open batch with its staging folder', async () => {
    const { application, password, dataDir, pool } = await composed(database);
    const address = await application.start();
    await pool.query("UPDATE users SET state = 'Active'");
    const { send } = await signedIn(address, password);
    const batch = await openedBatch(send, 'Pricing');
    const init = {
      method: 'PUT',
      type: 'application/octet-stream',
      name: encodeURIComponent('A.xlsx'),
      body: hangingBody(),
      duplex: 'half',
    };
    const arriving = send(`${batch.base}/${batch.batchId}/files`, init).catch(() => undefined);
    // The batch folder exists from the moment the batch opens; the file is arriving once its `.part`
    // file is in it, which is when the server holds the request that the stop has to end.
    await vi.waitFor(async () => {
      expect(await stagedNames(dataDir)).toHaveLength(1);
    });

    await application.stop();
    await arriving;

    expect(await readdir(join(dataDir, 'sources'))).toEqual([]);
  }, 30_000);
});

describe.skipIf(!hasTestDatabase)('the composed application and a batch left open', () => {
  it('RF-150 DEC-149 frees a batch open for 30 minutes on the sweep, with no further batch call', async () => {
    const clock = new FixedClock('2026-10-19T08:00:00.000Z');
    const timers = { clock, sweepMs: 50 };
    const { application, password, dataDir, pool } = await composed(database, false, timers);
    try {
      const address = await application.start();
      await pool.query("UPDATE users SET state = 'Active'");
      const { send } = await signedIn(address, password);
      const batch = await openedBatch(send, 'Pricing');
      await putBook(send, batch, 'A.xlsx');
      expect(await readdir(join(dataDir, 'sources'))).toHaveLength(1);

      clock.advance(31 * 60_000);

      await vi.waitFor(
        async () => {
          expect(await readdir(join(dataDir, 'sources'))).toEqual([]);
        },
        { timeout: 15_000 },
      );
      const again = await send(batch.base, { method: 'POST' });
      expect(again.status).toBe(201);
    } finally {
      await application.stop();
    }
  });
});
