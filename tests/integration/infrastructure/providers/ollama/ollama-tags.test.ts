import { afterEach, expect, it } from 'vitest';
import { OllamaInstalledModels } from '../../../../../src/infrastructure/providers/ollama/ollama-tags.js';
import {
  closedLoopbackUrl,
  FakeHttpServer,
  releaseClosedLoopbackUrls,
} from '../../../../support/fake-http-server.js';
import { FakeOllamaServer, loadOllamaRecording } from '../../../../support/fake-ollama-server.js';

// RF-405, DEC-156, ADR-008: the installed models of the Ollama server, read from /api/tags. A
// recorded answer gives the names; a server that is down, slow, wrong or not configured gives a
// reason, never an error. Fake servers on loopback only.

const servers: FakeHttpServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  releaseClosedLoopbackUrls();
});

async function started(server: FakeHttpServer): Promise<string> {
  servers.push(server);
  return server.start();
}

const ask = (baseUrl: string | undefined, timeoutMs = 2000) =>
  new OllamaInstalledModels({ baseUrl, testMode: true, timeoutMs }).list();

it('RF-405 reads the names of the installed models from a recorded /api/tags answer', async () => {
  const server = new FakeOllamaServer(await loadOllamaRecording('installed-models'));

  const answer = await ask(await started(server));

  expect(answer).toEqual({ ok: true, models: ['llama3.2:3b', 'gemma4:e4b', 'qwen3:8b'] });
  expect(server.received.map((request) => `${request.method} ${request.path}`)).toEqual([
    'GET /api/tags',
  ]);
});

it('RF-405 gives a reason when no Ollama server is configured', async () => {
  const answer = await ask(undefined);

  expect(answer).toEqual({ ok: false, reason: 'No Ollama server is configured.' });
});

it('RF-405 gives a reason when the server is down', async () => {
  const answer = await ask(await closedLoopbackUrl());

  expect(answer).toEqual({ ok: false, reason: 'Ollama could not be reached.' });
});

it('RF-405 gives a reason, within the timeout, when the server never answers', async () => {
  const hanging = new FakeHttpServer(() => ({ hang: true }));
  const url = await started(hanging);
  const began = Date.now();

  const answer = await ask(url, 100);

  expect(answer).toEqual({ ok: false, reason: 'Ollama did not answer in time.' });
  expect(Date.now() - began).toBeLessThan(1500);
});

it('RF-405 gives a reason when the server answers with an error', async () => {
  const failing = new FakeHttpServer(() => ({ status: 500, body: { error: 'boom' } }));

  const answer = await ask(await started(failing));

  expect(answer).toEqual({ ok: false, reason: 'Ollama could not be reached.' });
});

it.each([
  ['text', { status: 200, body: 'not json' }],
  ['a list of names without the models key', { status: 200, body: { names: ['a'] } }],
  ['a model without a name', { status: 200, body: { models: [{ digest: 'x' }] } }],
])('RF-405 gives a reason when the answer is %s', async (_name, exchange) => {
  const odd = new FakeHttpServer(() => exchange);

  const answer = await ask(await started(odd));

  expect(answer).toEqual({ ok: false, reason: 'Ollama sent an answer Rosetta cannot read.' });
});

it('RF-405 refuses an address no fake server registered while testing (ADR-008)', async () => {
  const unregistered = new FakeOllamaServer(await loadOllamaRecording('installed-models'), {
    registerPort: false,
  });

  const answer = await ask(await started(unregistered));

  expect(answer).toEqual({ ok: false, reason: 'Ollama could not be reached.' });
  expect(unregistered.received).toEqual([]);
});

it('RF-405 follows no redirect', async () => {
  const target = new FakeOllamaServer(await loadOllamaRecording('installed-models'));
  const targetUrl = await started(target);
  const redirecting = new FakeHttpServer((_method, path) => ({
    status: 302,
    headers: { location: `${targetUrl}${path}` },
    body: {},
  }));

  const answer = await ask(await started(redirecting));

  expect(answer.ok).toBe(false);
  expect(target.received).toEqual([]);
});
