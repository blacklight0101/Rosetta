import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { REPORT_CSP } from '../../../../src/infrastructure/report/report-security.js';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { auditHtml } from '../../../support/html-audit.js';
import {
  realRunOutputs,
  runFolderOf,
  seedRecordedRun,
} from '../../../support/run-output-harness.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-504, RF-506, RF-1013, RF-1105: POST /api/runs/:runId/report builds the report of a finished
// run, over a real data folder; the files it writes are then read back through the run file route.

let current: TestServer | undefined;
const data = useTempRoot('rosetta-build-report-');

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface Setup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly run: Run;
  readonly running: Run;
}

async function setup(): Promise<Setup> {
  const test = createTestServer(realRunOutputs(data.path));
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const run = await seedRecordedRun(test, amyUser.account.id, data.path);
  const running = await test.runs.start(actorOf(amyUser.account));
  return {
    test,
    run,
    running,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
  };
}

const reportUrl = (run: Run): string => `/api/runs/${run.id}/report`;
const fileUrl = (run: Run, path: string): string => `/runs/${run.id}/files/report/${path}`;
const FILES = [
  'report/cost.html',
  'report/questions.html',
  'report/replay.html',
  'report/replay.js',
  'report/report.css',
  'report/report.html',
  'report/report.md',
];

describe('POST /api/runs/:runId/report', () => {
  it('RF-504 builds the report of a finished run and lists the files it wrote', async () => {
    const { amy, run } = await setup();

    const response = await amy.request({ method: 'POST', url: reportUrl(run) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ files: FILES });
  });

  it('RF-504 makes a report.md that links the specification, the cards and the cost report', async () => {
    const { amy, run } = await setup();
    await amy.request({ method: 'POST', url: reportUrl(run) });

    const response = await amy.request({ method: 'GET', url: fileUrl(run, 'report.md') });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(response.body).toContain('(../spec.md)');
    expect(response.body).toContain('(../cost.md)');
    expect(response.body).toContain('(../cards/BR/BR-001.md)');
    expect(response.body).toContain('Coverage: not available for this run');
  });
});

describe('POST /api/runs/:runId/report and the coverage report', () => {
  it('RF-504 links coverage.md when the run wrote one, and the link resolves to that file', async () => {
    const { amy, run } = await setup();
    await writeFile(join(runFolderOf(data.path, scopeOf(run)), 'coverage.md'), '# Coverage');
    await amy.request({ method: 'POST', url: reportUrl(run) });

    const report = await amy.request({ method: 'GET', url: fileUrl(run, 'report.md') });
    const linked = await amy.request({ method: 'GET', url: `/runs/${run.id}/files/coverage.md` });

    expect(report.body).toContain('(../coverage.md)');
    expect(report.body).not.toContain('Coverage: not available');
    expect(linked.statusCode).toBe(200);
    expect(linked.body).toBe('# Coverage');
  });
});

describe('POST /api/runs/:runId/report and the pages it writes', () => {
  it('RF-1013 writes report pages that carry the policy and no-referrer in meta elements', async () => {
    const { amy, run } = await setup();
    await amy.request({ method: 'POST', url: reportUrl(run) });

    for (const name of ['report.html', 'questions.html', 'replay.html', 'cost.html']) {
      const response = await amy.request({ method: 'GET', url: fileUrl(run, name) });
      const page = auditHtml(response.body);

      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(page.csp).toBe(REPORT_CSP);
      expect(page.referrer).toBe('no-referrer');
      expect(page.handlers).toEqual([]);
      expect(page.inlineStyles).toBe(0);
    }
  });

  it('RF-507 shows the fixture card as text in the replay page: its script stays text', async () => {
    const { amy, run } = await setup();
    await amy.request({ method: 'POST', url: reportUrl(run) });

    const page = auditHtml(
      (await amy.request({ method: 'GET', url: fileUrl(run, 'replay.html') })).body,
    );

    expect(page.scripts).toEqual(['replay.js']);
    expect(page.document.querySelectorAll('img')).toHaveLength(0);
    expect(page.document.body.textContent).toContain('<script>window.__pwned');
    expect(page.foreignLinks).toEqual([]);
  });

  it('RF-506 serves the stylesheet and the script of the report as such', async () => {
    const { amy, run } = await setup();
    await amy.request({ method: 'POST', url: reportUrl(run) });

    const css = await amy.request({ method: 'GET', url: fileUrl(run, 'report.css') });
    const script = await amy.request({ method: 'GET', url: fileUrl(run, 'replay.js') });

    expect(css.headers['content-type']).toBe('text/css; charset=utf-8');
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8');
  });
});

describe('POST /api/runs/:runId/report and a folder that cannot be written', () => {
  it('RF-504 answers 500 with RST-1701 when the report folder cannot be made', async () => {
    const { amy, run } = await setup();
    // A file where the report folder should be: the writer cannot make the folder.
    await writeFile(join(runFolderOf(data.path, scopeOf(run)), 'report'), 'in the way');

    const response = await amy.request({ method: 'POST', url: reportUrl(run) });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.reportWriteFailed });
    expect(response.body).not.toContain(data.path);
  });
});

describe('POST /api/runs/:runId/report and a run with no events', () => {
  it('RF-504 builds an empty report for a run that recorded no events, and its replay page says so', async () => {
    const { test, amy, run } = await setup();
    const bare = sampleRun({
      userId: run.userId,
      runKey: '20261012-100500-scan',
      queueState: 'Ended',
      endState: 'Failed',
      startedAt: 1,
      endedAt: 2,
    });
    await test.runs.runs.insert(bare);

    const response = await amy.request({ method: 'POST', url: reportUrl(bare) });
    const replay = await amy.request({ method: 'GET', url: fileUrl(bare, 'replay.html') });
    const read = await amy.request({ method: 'GET', url: fileUrl(bare, 'report.md') });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ files: FILES });
    expect(read.statusCode).toBe(200);
    expect(replay.body).toContain('This run recorded no events.');
  });
});

describe('POST /api/runs/:runId/report and access', () => {
  it('RF-504 answers 409 while the run is in progress', async () => {
    const { amy, running } = await setup();

    const response = await amy.request({ method: 'POST', url: reportUrl(running) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.runInProgress });
  });

  it("RF-1105 answers 404 for another user's run and writes nothing", async () => {
    const { bob, amy, run } = await setup();

    const response = await bob.request({ method: 'POST', url: reportUrl(run) });
    const read = await amy.request({ method: 'GET', url: fileUrl(run, 'report.md') });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(read.statusCode).toBe(404);
  });

  it('RF-1009 answers 401 without a session and 403 without the CSRF token', async () => {
    const { test, amy, run } = await setup();

    const anonymous = await new TestBrowser(test.server).request({
      method: 'POST',
      url: reportUrl(run),
    });
    const noToken = await amy.request({ method: 'POST', url: reportUrl(run), csrf: false });

    expect(anonymous.statusCode).toBe(401);
    expect(noToken.statusCode).toBe(403);
  });
});
