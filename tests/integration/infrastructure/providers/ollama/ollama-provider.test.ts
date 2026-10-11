import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { OllamaProvider } from '../../../../../src/infrastructure/providers/ollama/ollama-provider.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { closedLoopbackUrl } from '../../../../support/fake-ollama-server.js';
import { failureOf } from '../../../../support/failure-of.js';
import { useFakeOllama } from '../../../../support/ollama-harness.js';

// RF-401: the Ollama adapter against a fake Ollama server (ADR-008).

const start = useFakeOllama();

function chatBody(bodies: unknown[]): Record<string, unknown> {
  const [body] = bodies;
  if (typeof body !== 'object' || body === null) throw new Error('no chat body was received');
  return Object.fromEntries(Object.entries(body));
}

describe('OllamaProvider with native tool calling', () => {
  it('RF-401 calls succeed with native tool calling where the model supports it', async () => {
    const { provider, server } = await start('contract-tool-call');

    const response = await provider.complete(contractRequest());

    expect(response.toolCalls).toEqual([
      {
        id: 'call-1',
        name: 'read_file',
        arguments: { path: 'src/Catalog.cs', startLine: 1, endLine: 40 },
      },
    ]);
    expect(response.finishReason).toBe('tool_use');
    const body = chatBody(server.chatBodies());
    expect(body['tools']).toEqual([
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Reads a line range of a file.',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      },
    ]);
  });

  it('RF-401 sends the context size, the output limit, no streaming and thinking off', async () => {
    const { provider, server } = await start('contract-text', { contextTokens: 16384 });

    await provider.complete(contractRequest());

    expect(chatBody(server.chatBodies())).toMatchObject({
      model: 'contract-model',
      stream: false,
      think: false,
      options: { num_ctx: 16384, num_predict: 512 },
    });
  });

  it('RF-401 sends a context size of 32768 tokens when none is configured', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete(contractRequest());

    expect(chatBody(server.chatBodies())).toMatchObject({ options: { num_ctx: 32768 } });
  });

  it('RF-401 reports the model digest from Ollama as the exact model version', async () => {
    const { provider } = await start('contract-text');

    const response = await provider.complete(contractRequest());

    expect(response.modelVersion).toBe(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );
  });

  it('RF-401 leaves thinking text out of the answer', async () => {
    const { provider } = await start('native-thinking-field');

    const response = await provider.complete({ ...contractRequest(), model: 'gemma4:e4b' });

    expect(response.text).toBe('The Catalog area lists products.');
  });

  it('RF-401 a model without native tool support fails with the fix: use toolMode text', async () => {
    const { provider } = await start('tools-unsupported');

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.ollamaToolsUnsupported, httpStatus: 400 });
  });
});

describe('OllamaProvider when Ollama or the model is missing', () => {
  it('RF-401 Ollama not running stops with an error code and the command to start it', async () => {
    const provider = new OllamaProvider({
      baseUrl: await closedLoopbackUrl(),
      toolMode: 'native',
      timeoutSeconds: 5,
      maxRetries: 3,
      textProtocolPrompt: '{{tools}}',
      testMode: true,
      fakeServer: true,
    });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toBeInstanceOf(RosettaError);
    expect(error).toMatchObject({ code: ERROR_CODES.ollamaUnreachable });
    expect(error instanceof Error ? error.message : '').toContain('ollama serve');
  });

  it('RF-401 a model that is not pulled stops with an error code and the pull command', async () => {
    const { provider, server } = await start('model-missing');

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.ollamaModelMissing });
    expect(error instanceof Error ? error.message : '').toContain('ollama pull contract-model');
    expect(server.chatBodies()).toEqual([]);
  });
});

describe('OllamaProvider in automated tests', () => {
  it('RNF-005 refuses to call a real Ollama when ROSETTA_TEST=1', async () => {
    const { provider, server } = await start('contract-text', { fakeServer: false });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.realProviderRefusedInTests });
    expect(server.received).toEqual([]);
  });

  it('RNF-005 calls a fake server only on a loopback address', async () => {
    const provider = new OllamaProvider({
      baseUrl: 'http://ollama.example.test:11434',
      toolMode: 'native',
      timeoutSeconds: 5,
      maxRetries: 0,
      textProtocolPrompt: '{{tools}}',
      testMode: true,
      fakeServer: true,
    });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.realProviderRefusedInTests });
  });
});
