import { afterEach, expect, it } from 'vitest';
import { ListModels } from '../../../../src/application/use-cases/list-models.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { OllamaInstalledModels } from '../../../../src/infrastructure/providers/ollama/ollama-tags.js';
import {
  closedLoopbackUrl,
  FakeHttpServer,
  releaseClosedLoopbackUrls,
} from '../../../support/fake-http-server.js';
import { FakeOllamaServer, loadOllamaRecording } from '../../../support/fake-ollama-server.js';
import {
  FakeInstalledModels,
  modelServices,
  testModelList,
  testModelPrices,
} from '../../../support/model-services.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-405, DEC-156, ADR-006: GET /api/models/:provider answers the models a role of that provider
// can be set to. It needs a session (any role); the Ollama server it asks is the one the server is
// configured with and never one named by the request.

let test: TestServer;
const fakes: FakeHttpServer[] = [];

afterEach(async () => {
  await test.server.close();
  await Promise.all(fakes.splice(0).map((fake) => fake.stop()));
  releaseClosedLoopbackUrls();
});

async function signedIn(role: 'user' | 'admin' = 'user'): Promise<TestBrowser> {
  return signedInBrowser(test.server, await addUser(test, { userName: 'reader', role }));
}

/** A route over the real Ollama adapter, pointed at `baseUrl`. */
function overOllama(baseUrl: string, timeoutMs = 2000) {
  const installed = new OllamaInstalledModels({ baseUrl, testMode: true, timeoutMs });
  return {
    listModels: new ListModels({ list: testModelList, prices: testModelPrices, installed }),
  };
}

it('RF-405 a signed-out request is refused with 401', async () => {
  test = createTestServer();

  const response = await test.server.inject({ method: 'GET', url: '/api/models/anthropic' });

  expect(response.statusCode).toBe(401);
});

it('RF-405 lists the Anthropic models, none of them priced, to a user', async () => {
  test = createTestServer();
  const user = await signedIn();

  const response = await user.request({ method: 'GET', url: '/api/models/anthropic' });

  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json()).toEqual({
    provider: 'anthropic',
    models: [
      { model: 'claude-opus-5-5', label: 'Claude Opus 5.5', priced: false },
      { model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', priced: false },
    ],
  });
});

it('RF-405 lists the OpenAI models and marks the unpriced one', async () => {
  test = createTestServer();
  const user = await signedIn('admin');

  const response = await user.request({ method: 'GET', url: '/api/models/openai' });

  expect(response.json()).toMatchObject({
    models: [
      { model: 'gpt-5-nano', priced: true },
      { model: 'gpt-5-future', priced: false },
    ],
  });
});

it('RF-405 lists nothing, without asking Ollama, for a provider with no fixed list', async () => {
  const installed = new FakeInstalledModels({ ok: true, models: ['gemma4:e4b'] });
  test = createTestServer({ models: modelServices(installed) });
  const user = await signedIn();

  const response = await user.request({ method: 'GET', url: '/api/models/openai-compatible' });

  expect(response.json()).toEqual({ provider: 'openai-compatible', models: [] });
  expect(installed.asked).toBe(0);
});

it('RF-405 a name that is no provider is refused with RST-2000', async () => {
  test = createTestServer();
  const user = await signedIn();

  const response = await user.request({ method: 'GET', url: '/api/models/nowhere' });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
});

it('RF-405 lists the installed Ollama models of a recorded /api/tags answer', async () => {
  const ollama = new FakeOllamaServer(await loadOllamaRecording('installed-models'));
  fakes.push(ollama);
  test = createTestServer({ models: overOllama(await ollama.start()) });
  const user = await signedIn();

  const response = await user.request({ method: 'GET', url: '/api/models/ollama' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    provider: 'ollama',
    models: [
      { model: 'gemma4:e4b', label: 'gemma4:e4b', priced: true },
      { model: 'llama3.2:3b', label: 'llama3.2:3b', priced: true },
      { model: 'qwen3:8b', label: 'qwen3:8b', priced: true },
    ],
  });
});

it('RF-405 answers an empty list and a reason, with 200, when Ollama is down', async () => {
  test = createTestServer({ models: overOllama(await closedLoopbackUrl()) });
  const user = await signedIn();

  const response = await user.request({ method: 'GET', url: '/api/models/ollama' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    provider: 'ollama',
    models: [],
    reason: 'Ollama could not be reached.',
  });
});

it('RF-405 answers within the timeout when Ollama is slow', async () => {
  const slow = new FakeHttpServer(() => ({ hang: true }));
  fakes.push(slow);
  test = createTestServer({ models: overOllama(await slow.start(), 100) });
  const user = await signedIn();
  const began = Date.now();

  const response = await user.request({ method: 'GET', url: '/api/models/ollama' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ models: [], reason: 'Ollama did not answer in time.' });
  expect(Date.now() - began).toBeLessThan(1500);
});

it('RF-405 asks only the configured Ollama server, never an address named in the request', async () => {
  const configured = new FakeOllamaServer(await loadOllamaRecording('installed-models'));
  const named = new FakeOllamaServer(await loadOllamaRecording('installed-models'));
  fakes.push(configured, named);
  test = createTestServer({ models: overOllama(await configured.start()) });
  const namedUrl = await named.start();
  const user = await signedIn();

  const response = await user.request({
    method: 'GET',
    url: `/api/models/ollama?url=${encodeURIComponent(namedUrl)}&baseUrl=${encodeURIComponent(namedUrl)}`,
    headers: { 'x-ollama-url': namedUrl },
  });

  expect(response.statusCode).toBe(200);
  expect(configured.received.map((request) => request.path)).toEqual([
    '/api/tags',
    ...['/api/show', '/api/show', '/api/show'],
  ]);
  expect(named.received).toEqual([]);
});

it('RF-405 limits the questions one address can ask to 60 a minute', async () => {
  test = createTestServer();
  const user = await signedIn();

  const statuses: number[] = [];
  for (let index = 0; index < 61; index += 1) {
    const response = await user.request({ method: 'GET', url: '/api/models/openai' });
    statuses.push(response.statusCode);
  }

  expect(statuses.filter((status) => status === 200)).toHaveLength(60);
  expect(statuses.at(-1)).toBe(429);
});

it('RF-401 Q-44 the Ollama list carries the trained context of each model from /api/show', async () => {
  const ollama = new FakeOllamaServer(await loadOllamaRecording('installed-models-trained'));
  fakes.push(ollama);
  test = createTestServer({ models: overOllama(await ollama.start()) });
  const user = await signedIn();

  const response = await user.request({ method: 'GET', url: '/api/models/ollama' });

  expect(response.json()).toMatchObject({
    provider: 'ollama',
    models: [
      { model: 'gemma4:e4b', trainedContext: 8192 },
      { model: 'llama3.2:3b', trainedContext: 8192 },
      { model: 'qwen3:8b', trainedContext: 8192 },
    ],
  });
});
