import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { fixturePassword } from '../../support/account-fixtures.js';
import { hasTestDatabase, useTestDatabase, type TestDatabase } from '../../support/postgres.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';
import { sampleZip } from '../../support/upload-store-harness.js';
import { removeWritableTree } from '../../support/writable-temp-root.js';

// RF-128, RF-133, RF-134: the composed application, not a hand-wired one. The page reads the upload
// limit from GET /api/session, a zip is uploaded, and deleting the project takes its snapshot with
// it. Both wirings of the composition root (the limit given to the server, the upload store given
// to the deletion) are only proved here.

const origin = 'http://127.0.0.1:8080';
const admin = ['upload', 'admin'].join('.');
const folders: string[] = [];

afterAll(async () => {
  await Promise.all(folders.map((folder) => removeWritableTree(folder)));
});

const sessionBody = z.object({ csrfToken: z.string(), uploadMaxMb: z.number().optional() });
const idBody = z.object({ id: z.string() });

/** A signed-in client of the started application: cookies kept by hand, as a browser does. */
async function signedIn(address: string, password: string) {
  const cookies = new Map<string, string>();
  const keep = (response: Response): void => {
    for (const line of response.headers.getSetCookie()) {
      const [pair = ''] = line.split(';');
      const [name = '', ...value] = pair.split('=');
      cookies.set(name, value.join('='));
    }
  };
  const cookie = (): string => [...cookies].map(([n, v]) => `${n}=${v}`).join('; ');
  const first = await fetch(`${address}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ userName: admin, password }),
  });
  keep(first);
  const csrf = sessionBody.parse(await first.json()).csrfToken;
  const send = (
    path: string,
    init: RequestInit & { type?: string; name?: string } = {},
  ): Promise<Response> =>
    fetch(`${address}${path}`, {
      ...init,
      headers: {
        cookie: cookie(),
        origin,
        'x-csrf-token': csrf,
        ...(init.type === undefined ? {} : { 'content-type': init.type }),
        ...(init.name === undefined ? {} : { 'x-file-name': init.name }),
      },
    });
  return { send };
}

async function snapshotFolders(dataDir: string): Promise<string[]> {
  const found = await readdir(join(dataDir, 'sources')).catch(() => []);
  return found.filter((name) => name.startsWith('upload__'));
}

/** The file name `snapshot.json` keeps, as the server decoded it from the header. */
async function storedFileName(dataDir: string, folder = ''): Promise<unknown> {
  const text = await readFile(join(dataDir, 'sources', folder, 'snapshot.json'), 'utf8');
  return z.object({ fileName: z.string() }).parse(JSON.parse(text)).fileName;
}

async function composed(database: TestDatabase) {
  const schema = await database.createSchema({ migrate: true });
  const dataDir = await mkdtemp(join(tmpdir(), 'rst-composed-upload-'));
  folders.push(dataDir);
  const password = fixturePassword('Composed');
  const application = composeApplication({
    environment: loadEnvironment({
      DATABASE_URL: schema.url,
      ROSETTA_SECRET_KEY: fixtureSecret(11),
      ROSETTA_PUBLIC_URL: origin,
      ROSETTA_DATA_DIR: dataDir,
      ROSETTA_ADMIN_USER: admin,
      ROSETTA_ADMIN_PASSWORD: password,
      ROSETTA_UPLOAD_MAX_MB: '7',
    }),
    listen: { host: '127.0.0.1', port: 0 },
    output: { write: () => true },
  });
  return { application, password, dataDir, pool: schema.pool };
}

describe.skipIf(!hasTestDatabase)('the composed application and an upload', () => {
  const database = useTestDatabase();

  it('RF-134 RF-133 tells the page the limit, stores an upload and deletes it with the project', async () => {
    const { application, password, dataDir, pool } = await composed(database);
    try {
      const address = await application.start();
      await pool.query("UPDATE users SET state = 'Active'");
      const { send } = await signedIn(address, password);

      const session = sessionBody.parse(await (await send('/api/session')).json());
      const created = await send('/api/projects', {
        method: 'POST',
        type: 'application/json',
        body: JSON.stringify({ sourceKind: 'upload', name: 'OrderDesk' }),
      });
      const id = idBody.parse(await created.json()).id;
      const uploaded = await send(`/api/projects/${id}/source`, {
        method: 'PUT',
        type: 'application/zip',
        name: encodeURIComponent('Café Orders.zip'),
        body: new Uint8Array(await sampleZip()),
      });
      const stored = await snapshotFolders(dataDir);
      const named = await storedFileName(dataDir, stored[0]);
      const deleted = await send(`/api/projects/${id}`, { method: 'DELETE' });

      expect(session.uploadMaxMb).toBe(7);
      expect(uploaded.status).toBe(201);
      expect(stored).toHaveLength(1);
      expect(named).toBe('Café Orders.zip');
      expect(deleted.status).toBe(200);
      expect(await snapshotFolders(dataDir)).toEqual([]);
    } finally {
      await application.stop();
    }
  });
});
