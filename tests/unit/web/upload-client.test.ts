import { afterEach, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../web/src/api/client.js';
import { uploadSource, uploadSummarySchema } from '../../../web/src/api/source-upload.js';
import { installFakeUploadServer, type FakeUploadServer } from './fake-upload-server.js';
import { zipFile } from './zip-fixtures.js';

// RF-128, RNF-008, RF-1009: the client's upload call. A zip goes as the body of a PUT under /api/
// with the CSRF token; an answer is parsed like any other; a lost connection, a timeout and a
// cancelled upload are told apart from a refusal and never throw.

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = { files: 3, size: 30, skipped: 0, snapshotHash: 'c'.repeat(64) };

interface Started {
  readonly server: FakeUploadServer;
  readonly answer: ReturnType<typeof uploadSource>;
  readonly progress: number[];
}

async function startUpload(): Promise<Started> {
  const server = installFakeUploadServer();
  const client = createApiClient();
  client.setCsrfToken('csrf-up');
  const progress: number[] = [];
  const answer = uploadSource(client, 'p 1', zipFile(), {
    onProgress: (loaded) => {
      progress.push(loaded);
    },
  });
  await Promise.resolve();
  return { server, answer, progress };
}

it('RF-128 sends the zip to the project source with the CSRF token and parses the summary', async () => {
  const { server, answer, progress } = await startUpload();
  const sent = server.pending();

  sent.progress(4, 8);
  sent.respond(201, summary);

  expect(sent.path).toBe('/api/projects/p%201/source');
  expect(sent.method).toBe('PUT');
  expect(sent.headers['x-csrf-token']).toBe('csrf-up');
  expect(sent.headers['content-type']).toBe('application/zip');
  expect(progress).toEqual([4]);
  expect(await answer).toEqual({ ok: true, value: summary });
});

it('RF-128 an answer that is not a summary is reported as unreadable, not trusted', async () => {
  const { server, answer } = await startUpload();

  server.pending().respond(201, { files: 'many' });

  const result = await answer;
  expect(result.ok).toBe(false);
  expect(result.ok ? '' : result.error.code).toBe('RST-2006');
});

it('RF-128 a refusal keeps its code, message and next step', async () => {
  const { server, answer } = await startUpload();

  server.pending().respond(413, {
    code: 'RST-1912',
    message: 'Too large.',
    nextStep: 'Zip less.',
  });

  const result = await answer;
  expect(result.ok ? undefined : result.error).toMatchObject({
    status: 413,
    code: 'RST-1912',
    nextStep: 'Zip less.',
  });
});

it('RF-128 a lost connection and a timeout are both reported as unreachable', async () => {
  const lost = await startUpload();
  lost.server.pending().failNetwork();
  const slow = await startUpload();
  slow.server.pending().failTimeout();

  const [first, second] = await Promise.all([lost.answer, slow.answer]);
  expect(first.ok ? '' : first.error.code).toBe('RST-2009');
  expect(second.ok ? '' : second.error.code).toBe('RST-2009');
});

it('RF-128 an upload cancelled by the caller is reported as cancelled', async () => {
  const server = installFakeUploadServer();
  const client = createApiClient();
  const abort = new AbortController();
  const answer = client.upload({
    path: '/api/projects/p-1/source',
    file: zipFile(),
    contentType: 'application/zip',
    schema: uploadSummarySchema,
    signal: abort.signal,
  });
  await Promise.resolve();

  abort.abort();

  const result = await answer;
  expect(result.ok ? '' : result.error.code).toBe('RST-2010');
  expect(server.requests).toHaveLength(1);
});

it('RF-1009 refuses a path outside the API and sends nothing', async () => {
  const server = installFakeUploadServer();
  const client = createApiClient();

  const result = await client.upload({
    path: 'https://example.com/steal',
    file: zipFile(),
    contentType: 'application/zip',
    schema: uploadSummarySchema,
  });

  expect(result.ok ? '' : result.error.code).toBe('RST-2006');
  expect(server.requests).toHaveLength(0);
});
