import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { exchange } from '../../../../../src/infrastructure/providers/ollama/ollama-http.js';
import { OllamaProvider } from '../../../../../src/infrastructure/providers/ollama/ollama-provider.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../../support/failure-of.js';
import { FakeHttpServer } from '../../../../support/fake-http-server.js';
import { FakeOllamaServer, loadOllamaRecording } from '../../../../support/fake-ollama-server.js';
import { RecordingLogger } from '../../../../support/recording-logger.js';

// RF-401, ADR-013: the Ollama adapter never follows a redirect, so an answer of 302 cannot lead a
// call, with the prompt and the code in it, to another address.

const servers: FakeHttpServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

interface Redirected {
  /** The address the adapter is given; it answers every request with 302. */
  readonly first: string;
  /** The address the 302 points to: a working fake Ollama. */
  readonly second: FakeOllamaServer;
}

async function redirected(): Promise<Redirected> {
  const second = new FakeOllamaServer(await loadOllamaRecording('contract-text'));
  servers.push(second);
  const target = await second.start();
  const first = new FakeHttpServer((_method, path) => ({
    status: 302,
    headers: { location: `${target}${path}` },
    body: {},
  }));
  servers.push(first);
  return { first: await first.start(), second };
}

describe('Ollama redirects', () => {
  it('RF-401 a 302 answer is an error and the address it names is never called', async () => {
    const { first, second } = await redirected();

    const result = await exchange({
      url: new URL('/api/tags', first),
      model: 'contract-model',
      timeoutMs: 5_000,
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({ ok: false });
    expect(second.received).toEqual([]);
  });

  it('RF-401 a provider call that meets a 302 fails without reaching the second address', async () => {
    const { first, second } = await redirected();
    const provider = new OllamaProvider({
      ...{ baseUrl: first, toolMode: 'native', timeoutSeconds: 5, maxRetries: 1, testMode: true },
      textProtocolPrompt: '{{tools}}',
      logger: new RecordingLogger(),
      sleep: () => Promise.resolve(),
    });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed });
    expect(second.received).toEqual([]);
  });
});
