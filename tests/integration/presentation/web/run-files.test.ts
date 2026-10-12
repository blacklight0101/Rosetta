import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { fallbackSecurityHeaders } from '../../../../src/presentation/web/security-headers.js';
import { replayDemoText } from '../../../support/replay-fixture.js';
import {
  realRunOutputs,
  runFolderOf,
  seedRecordedRun,
} from '../../../support/run-output-harness.js';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { createTestServer, testPublicUrl, type TestServer } from '../../../support/web-server.js';

// RF-504, RF-506, RF-507, RF-1013, RF-1105: GET /runs/:runId/files/* through the server with a
// session, over a real data folder: owner-scoped, text as text, the report pages as pages, the rest
// as downloads, with the content security policy and nosniff on every answer.

let current: TestServer | undefined;
const data = useTempRoot('rosetta-run-files-');

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface Setup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly run: Run;
}

async function setup(extra: Readonly<Record<string, string>> = {}): Promise<Setup> {
  const test = createTestServer(realRunOutputs(data.path));
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const run = await seedRecordedRun(test, amyUser.account.id, data.path);
  for (const [path, text] of Object.entries(extra)) {
    const file = join(runFolderOf(data.path, scopeOf(run)), path);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, text);
  }
  return {
    test,
    run,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
  };
}

const urlOf = (run: Run, path: string): string => `/runs/${run.id}/files/${path}`;
// helmet writes the directives without a space after `;`
const policy = fallbackSecurityHeaders(testPublicUrl)['Content-Security-Policy']?.replaceAll(
  '; ',
  ';',
);

describe('GET /runs/:runId/files/* as text', () => {
  it('RF-507 serves a card file as plain text, byte for byte, with the policy and nosniff', async () => {
    const { amy, run } = await setup();

    const response = await amy.request({ method: 'GET', url: urlOf(run, 'cards/BR/BR-001.md') });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(response.body).toBe(await replayDemoText('cards/BR/BR-001.md'));
    expect(response.headers['content-security-policy']).toBe(policy);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-disposition']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each([
    ['manifest.json', 'application/json; charset=utf-8'],
    ['events.jsonl', 'text/plain; charset=utf-8'],
    ['spec.md', 'text/plain; charset=utf-8'],
    ['cost.md', 'text/plain; charset=utf-8'],
  ])('RF-504 serves %s inline as %s', async (path, contentType) => {
    const { amy, run } = await setup();

    const response = await amy.request({ method: 'GET', url: urlOf(run, path) });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe(contentType);
    expect(response.body).toBe(await replayDemoText(path as 'spec.md'));
  });
});

describe('GET /runs/:runId/files/* as a page or a download', () => {
  it('RF-506 serves a page of the report as a page, still under the policy', async () => {
    const { amy, run } = await setup({ 'report/replay.html': '<!doctype html><p>x</p>\n' });

    const response = await amy.request({ method: 'GET', url: urlOf(run, 'report/replay.html') });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['content-security-policy']).toBe(policy);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('RF-507 serves a page anywhere else as a download, never as a page', async () => {
    const { amy, run } = await setup({ 'handoff/page.html': '<script>1</script>\n' });

    const response = await amy.request({ method: 'GET', url: urlOf(run, 'handoff/page.html') });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['content-disposition']).toBe('attachment; filename="page.html"');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('RF-506 serves an unknown kind of file as a download named after the file', async () => {
    const { amy, run } = await setup({ 'handoff/package.zip': 'PK' });

    const response = await amy.request({ method: 'GET', url: urlOf(run, 'handoff/package.zip') });

    expect(response.headers['content-disposition']).toBe('attachment; filename="package.zip"');
    expect(response.rawPayload.toString()).toBe('PK');
  });
});

describe('GET /runs/:runId/files/* and access', () => {
  it("RF-1105 answers 404 for another user's run, like an unknown one", async () => {
    const { bob, run } = await setup();

    const other = await bob.request({ method: 'GET', url: urlOf(run, 'manifest.json') });
    const unknown = await bob.request({
      method: 'GET',
      url: '/runs/not-a-uuid/files/manifest.json',
    });

    expect(other.statusCode).toBe(404);
    expect(other.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(other.json()).toEqual(unknown.json());
    expect(other.body).not.toContain('schemaVersion');
  });

  it('RF-1009 sends a visitor without a session to the sign-in page', async () => {
    const { test, run } = await setup();

    const response = await new TestBrowser(test.server).request({
      method: 'GET',
      url: urlOf(run, 'manifest.json'),
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/sign-in');
  });

  it('RF-506 answers 404 for a file the run does not have and for a folder', async () => {
    const { amy, run } = await setup();

    for (const path of ['coverage.md', 'cards', 'cards/', 'cards/BR']) {
      const response = await amy.request({ method: 'GET', url: urlOf(run, path) });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
    }
  });
});

describe('GET /runs/:runId/files/* and hostile paths', () => {
  it.each([
    '../manifest.json',
    '%2e%2e/manifest.json',
    '%2E%2E%2Fmanifest.json',
    'cards%2F..%2F..%2Fmanifest.json',
    'cards/%2e%2e/%2e%2e/manifest.json',
    '/manifest.json',
    '%2Fmanifest.json',
    '%2Fetc%2Fpasswd',
    '..%5Cmanifest.json',
    '%5C..%5Cmanifest.json',
    'C:%5CWindows%5Cwin.ini',
    'manifest.json%00.txt',
    '.%2e/manifest.json',
    '%252e%252e/manifest.json',
  ])('RF-005 answers 404 for the path %s', async (path) => {
    const { amy, run } = await setup();

    const response = await amy.request({ method: 'GET', url: urlOf(run, path) });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('schemaVersion');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('RF-005 answers 404 for a path that names a link out of the run folder', async () => {
    const { amy, run } = await setup();
    const outside = join(data.path, 'elsewhere');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'secret.txt'), 'outside\n');
    await symlink(outside, join(runFolderOf(data.path, scopeOf(run)), 'linked'), 'junction');

    const response = await amy.request({ method: 'GET', url: urlOf(run, 'linked/secret.txt') });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('outside');
  });
});
