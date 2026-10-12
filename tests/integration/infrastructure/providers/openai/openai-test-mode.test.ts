import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { OpenAiProvider } from '../../../../../src/infrastructure/providers/openai/openai-provider.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { FakeOpenAiServer, loadOpenAiRecording } from '../../../../support/fake-openai-server.js';
import { failureOf } from '../../../../support/failure-of.js';
import { fakeOpenAiKey } from '../../../../support/secret-fixture.js';

// RNF-005, ADR-008: under ROSETTA_TEST=1 the OpenAI adapter calls only a registered fake server.

describe('OpenAiProvider in automated tests', () => {
  const servers: FakeOpenAiServer[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()));
  });

  async function startServer(registerPort: boolean): Promise<FakeOpenAiServer> {
    const server = new FakeOpenAiServer(await loadOpenAiRecording('contract-text'), {
      registerPort,
    });
    servers.push(server);
    return server;
  }

  function providerOn(baseUrl: string): OpenAiProvider {
    return new OpenAiProvider({
      apiKey: fakeOpenAiKey,
      baseUrl: `${baseUrl}/v1`,
      timeoutSeconds: 5,
      maxRetries: 0,
      testMode: true,
    });
  }

  it('RNF-005 trusts the port the fake server registered, without a flag from the caller', async () => {
    const server = await startServer(true);

    const response = await providerOn(await server.start()).complete(contractRequest());

    expect(response.text).not.toBe('');
    expect(server.chatBodies()).toHaveLength(1);
  });

  it('RNF-005 refuses a loopback server that did not register its port', async () => {
    const server = await startServer(false);

    const error = await failureOf(providerOn(await server.start()).complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.realProviderRefusedInTests });
    expect(server.received).toEqual([]);
  });
});
