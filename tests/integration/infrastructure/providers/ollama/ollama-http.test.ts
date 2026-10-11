import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { exchange } from '../../../../../src/infrastructure/providers/ollama/ollama-http.js';
import { FakeOllamaServer, loadOllamaRecording } from '../../../../support/fake-ollama-server.js';

// RF-401, conventions section 5: an Ollama answer larger than its cap is refused, not read.

const servers: FakeOllamaServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

async function tagsUrl(): Promise<URL> {
  const server = new FakeOllamaServer(await loadOllamaRecording('contract-text'));
  servers.push(server);
  return new URL('/api/tags', await server.start());
}

describe('Ollama HTTP exchange', () => {
  it('RF-401 refuses an answer larger than the body cap without retrying it', async () => {
    const result = await exchange({
      url: await tagsUrl(),
      model: 'contract-model',
      timeoutMs: 5_000,
      signal: new AbortController().signal,
      maxBodyBytes: 16,
    });

    expect(result).toMatchObject({
      ok: false,
      failed: { failure: { code: ERROR_CODES.providerCallFailed }, retryable: false },
    });
  });

  it('RF-401 reads an answer within the body cap', async () => {
    const result = await exchange({
      url: await tagsUrl(),
      model: 'contract-model',
      timeoutMs: 5_000,
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      ok: true,
      body: { models: [{ name: 'contract-model:latest' }] },
    });
  });
});
