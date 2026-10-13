import { afterEach, describe, expect, it } from 'vitest';
import { OpenAiProvider } from '../../../../../src/infrastructure/providers/openai/openai-provider.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../../support/failure-of.js';
import { FakeHttpServer } from '../../../../support/fake-http-server.js';
import { FakeOpenAiServer, loadOpenAiRecording } from '../../../../support/fake-openai-server.js';
import { fakeOpenAiKey } from '../../../../support/secret-fixture.js';

// RF-402, ADR-013: the OpenAI adapter never follows a redirect, so an answer of 302 cannot lead a
// call, with the key, the prompt and the code in it, to another address.

const servers: FakeHttpServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

describe('OpenAI redirects', () => {
  it('RF-402 a 302 answer is an error and the address it names is never called', async () => {
    const second = new FakeOpenAiServer(await loadOpenAiRecording('contract-text'));
    servers.push(second);
    const target = await second.start();
    const first = new FakeHttpServer((_method, path) => ({
      status: 302,
      headers: { location: `${target}${path}` },
      body: {},
    }));
    servers.push(first);
    const provider = new OpenAiProvider({
      apiKey: fakeOpenAiKey,
      baseUrl: `${await first.start()}/v1`,
      timeoutSeconds: 5,
      maxRetries: 0,
      testMode: true,
    });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toBeInstanceOf(Error);
    expect(second.received).toEqual([]);
  });
});
