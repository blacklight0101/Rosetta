import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import type { ArchiveWriter } from '../../../../src/application/ports/archive-writer.js';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { ok } from '../../../../src/domain/errors/result.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { YazlArchiveWriter } from '../../../../src/infrastructure/files/yazl-archive-writer.js';
import { treeOf, treeOfEntries } from '../../../support/folder-tree.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';
import { filesOf, readZip } from '../../../support/zip-reader.js';

// RF-008, RF-1105: GET /api/runs/:runId/zip and /handoff.zip through the server with a session.

let current: TestServer | undefined;
const data = useTempRoot('rosetta-export-');

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

/** Archives any run as the same few bytes; the name under test does not depend on the content. */
const anyArchive: ArchiveWriter = {
  archive: () => Promise.resolve(ok(Readable.from([Buffer.from('PK')]))),
};

const files = {
  'manifest.json': '{"schemaVersion":1}\n',
  'cards/BEHAVIOUR/BEH-001.md': '# Orders\n',
  'handoff/README.md': '# Hand-off\n',
};

interface Setup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly amyId: string;
  /** Amy's run that ended, with a folder holding `files`; her next run is running, the one after queued. */
  readonly ended: Run;
  readonly running: Run;
  readonly queued: Run;
}

async function setup(options: Parameters<typeof createTestServer>[0] = {}): Promise<Setup> {
  const test = createTestServer(options);
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const first = await test.runs.start(actorOf(amyUser.account));
  test.runs.executor.settle(first.id, { endState: 'Completed' });
  const ended = await test.runs.ended(first);
  test.archives.seed(test.runs.scopeOf(ended), files);
  const running = await test.runs.start(actorOf(amyUser.account));
  const queued = await test.runs.start(actorOf(amyUser.account));
  return {
    amyId: amyUser.account.id,
    running,
    test,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
    ended,
    queued,
  };
}

const zipUrl = (run: Run): string => `/api/runs/${run.id}/zip`;
const handoffUrl = (run: Run): string => `/api/runs/${run.id}/handoff.zip`;

describe('GET /api/runs/:runId/zip', () => {
  it('RF-008 downloads the zip of a finished run with the folder structure', async () => {
    const { amy, ended } = await setup();

    const response = await amy.request({ method: 'GET', url: zipUrl(ended) });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="${ended.runKey}.zip"`,
    );
    expect(Object.keys(filesOf(await readZip(response.rawPayload)))).toEqual(
      Object.keys(files).map((path) => `${ended.runKey}/${path}`),
    );
  });

  it('RF-008 answers 409 with an error code while the run is running or queued', async () => {
    const { amy, running, queued } = await setup();

    for (const run of [running, queued]) {
      const response = await amy.request({ method: 'GET', url: zipUrl(run) });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.runInProgress });
      expect(response.headers['content-type']).toContain('application/json');
    }
  });
});

describe('GET /api/runs/:runId/zip and access', () => {
  it("RF-1105 answers 404 for another user's run, like an unknown one", async () => {
    const { bob, ended } = await setup();

    const other = await bob.request({ method: 'GET', url: zipUrl(ended) });
    const unknown = await bob.request({ method: 'GET', url: '/api/runs/not-a-uuid/zip' });

    expect(other.statusCode).toBe(404);
    expect(other.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(other.json()).toEqual(unknown.json());
    expect(other.rawPayload.includes(Buffer.from('PK'))).toBe(false);
  });

  it("RF-1105 answers 404 for another user's run that is in progress", async () => {
    const { bob, queued } = await setup();

    const response = await bob.request({ method: 'GET', url: zipUrl(queued) });

    expect(response.statusCode).toBe(404);
  });

  it('RF-1009 answers 401 without a session', async () => {
    const { test, ended } = await setup();

    const response = await new TestBrowser(test.server).request({
      method: 'GET',
      url: zipUrl(ended),
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/runs/:runId/handoff.zip', () => {
  it('RF-008 downloads only the handoff folder', async () => {
    const { amy, ended } = await setup();

    const response = await amy.request({ method: 'GET', url: handoffUrl(ended) });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="${ended.runKey}-handoff.zip"`,
    );
    expect(filesOf(await readZip(response.rawPayload))).toEqual({
      'handoff/README.md': '# Hand-off\n',
    });
  });

  it('RF-008 answers 409 while the run is in progress', async () => {
    const { amy, running } = await setup();

    const response = await amy.request({ method: 'GET', url: handoffUrl(running) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.runInProgress });
  });

  it("RF-1105 answers 404 for another user's run", async () => {
    const { bob, ended } = await setup();

    const response = await bob.request({ method: 'GET', url: handoffUrl(ended) });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
  });

  it('RF-008 answers 404 for a finished run without a hand-off package', async () => {
    const { test, amy, ended } = await setup();
    test.archives.seed(test.runs.scopeOf(ended), { 'manifest.json': '{}\n' });

    const response = await amy.request({ method: 'GET', url: handoffUrl(ended) });

    expect(response.statusCode).toBe(404);
  });
});

describe('the download file name', () => {
  it('RF-008 never carries a quote, a line break or a path in Content-Disposition', async () => {
    const { test, amy, amyId } = await setup({ archiveWriter: anyArchive });
    const hostile = sampleRun({
      userId: amyId,
      runKey: '20261012-100000-scan"\r\nSet-Cookie: x=1; /../',
      queueState: 'Ended',
      endState: 'Completed',
      startedAt: 1,
      endedAt: 2,
    });
    await test.runs.runs.insert(hostile);

    const response = await amy.request({ method: 'GET', url: zipUrl(hostile) });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="[A-Za-z0-9._-]+\.zip"$/,
    );
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});

describe('the zip of a real run folder', () => {
  it('RF-008 unzips to the tree of the run folder, for the whole run and for the hand-off', async () => {
    const { amy, ended } = await setup({ archiveWriter: new YazlArchiveWriter(data.path) });
    const folder = join(
      data.path,
      ...['users', ended.userId, 'projects', ended.projectId, 'runs', ended.runKey],
    );
    const written = {
      'manifest.json': '{"schemaVersion":1}\n',
      'events.jsonl': '{"seq":1}\n',
      'cards/index.json': '{}\n',
      'cards/BEHAVIOUR/BEH-001.md': '# Orders\n',
      'transcripts/task-1.jsonl': '{"role":"user"}\n',
      'report/index.html': '<p>Report</p>\n',
      'handoff/README.md': '# Hand-off\n',
      'handoff/adr/ADR-001.md': '# ADR\n',
    };
    for (const [path, content] of Object.entries(written)) {
      await mkdir(dirname(join(folder, path)), { recursive: true });
      await writeFile(join(folder, path), content);
    }
    await mkdir(join(folder, 'invalid-output'));

    const whole = await amy.request({ method: 'GET', url: zipUrl(ended) });
    const handoff = await amy.request({ method: 'GET', url: handoffUrl(ended) });

    expect(treeOfEntries(await readZip(whole.rawPayload), `${ended.runKey}/`)).toEqual(
      await treeOf(folder),
    );
    expect(treeOfEntries(await readZip(handoff.rawPayload), 'handoff/')).toEqual(
      await treeOf(join(folder, 'handoff')),
    );
  });
});
