import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LlmRequest } from '../../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../../support/failure-of.js';
import { useFakeOpenAi } from '../../../../support/openai-harness.js';
import { fakeOpenAiKey } from '../../../../support/secret-fixture.js';

// RF-402: the OpenAI adapter against a fake OpenAI server (ADR-008).

const start = useFakeOpenAi();

afterEach(() => {
  vi.unstubAllEnvs();
});

function firstBody(bodies: unknown[]): unknown {
  const [body] = bodies;
  if (body === undefined) throw new Error('no chat completion body was received');
  return body;
}

/** A request in the middle of an agent task: an earlier tool call and its result. */
function followUpRequest(): LlmRequest {
  return {
    ...contractRequest(),
    messages: [
      { role: 'user', content: 'Describe the Catalog area.' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_FAKE01', name: 'read_file', arguments: { path: 'a.cs' } }],
      },
      { role: 'tool', toolCallId: 'call_FAKE01', content: '1: class Catalog {}' },
    ],
  };
}

describe('OpenAiProvider requests', () => {
  it('RF-402 sends the system prompt, messages, tools and output limit without streaming', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete(contractRequest());

    expect(firstBody(server.chatBodies())).toEqual({
      model: 'contract-model',
      messages: [
        { role: 'system', content: 'You describe one area of a legacy codebase.' },
        { role: 'user', content: 'Describe the Catalog area.' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'read_file',
            description: 'Reads a line range of a file.',
            parameters: { type: 'object', properties: { path: { type: 'string' } } },
          },
        },
      ],
      max_completion_tokens: 512,
      stream: false,
    });
  });
});

describe('OpenAiProvider conversation history', () => {
  it('RF-402 sends earlier tool calls with JSON arguments and tool results by call id', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete({ ...followUpRequest(), temperature: 0.2 });

    expect(firstBody(server.chatBodies())).toMatchObject({
      temperature: 0.2,
      messages: [
        { role: 'system' },
        { role: 'user' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_FAKE01',
              type: 'function',
              function: { name: 'read_file', arguments: '{"path":"a.cs"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_FAKE01', content: '1: class Catalog {}' },
      ],
    });
  });
});

describe('OpenAiProvider request headers and fields', () => {
  it('RF-402 sends no tools field when the call has no tools', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete({ ...contractRequest(), tools: [] });

    expect(firstBody(server.chatBodies())).not.toHaveProperty('tools');
  });

  it('RF-402 sends the key it was given and never one from the environment', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'env-key-must-not-be-sent');
    vi.stubEnv('OPENAI_CUSTOM_HEADERS', 'x-env-header: must-not-be-sent');
    vi.stubEnv('OPENAI_ORG_ID', 'org-must-not-be-sent');
    const { provider, server } = await start('contract-text');

    await provider.complete(contractRequest());

    const [request] = server.received;
    expect(request?.headers['authorization']).toBe(`Bearer ${fakeOpenAiKey}`);
    expect(request?.headers).not.toHaveProperty('x-env-header');
    expect(request?.headers).not.toHaveProperty('openai-organization');
  });
});

describe('OpenAiProvider answers', () => {
  it('RF-402 reports the dated model id and the request id', async () => {
    const { provider } = await start('contract-text');

    const response = await provider.complete(contractRequest());

    expect(response.modelVersion).toBe('contract-model-2026-08-07');
    expect(response.requestId).toBe('req_FAKE0000000000000000000001');
    expect(response.metrics).toEqual({ httpStatus: 200 });
  });

  it('RF-402 reports cached input tokens when the API reports them', async () => {
    const { provider } = await start('contract-text');

    const response = await provider.complete(contractRequest());

    expect(response.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 80,
      cachedInputTokens: 1024,
      usageSource: 'reported',
    });
  });

  it('RF-402 reports zero cached input tokens when the API leaves the details out', async () => {
    const { provider } = await start('cached-details-missing');

    const response = await provider.complete(contractRequest());

    expect(response.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 80,
      cachedInputTokens: 0,
      usageSource: 'reported',
    });
  });
});

describe('OpenAiProvider answer shapes', () => {
  it('RF-421 estimates the usage when the API reports none', async () => {
    const { provider } = await start('usage-missing');

    const response = await provider.complete(contractRequest());

    expect(response.usage.usageSource).toBe('estimated');
    expect(response.usage.outputTokens).toBe(13);
    expect(response.usage.inputTokens).toBeGreaterThan(0);
  });

  it('RF-402 reports an answer cut off by the output limit as length', async () => {
    const { provider } = await start('length');

    const response = await provider.complete(contractRequest());

    expect(response).toMatchObject({ text: 'The Catalog area lists', finishReason: 'length' });
  });

  it('RF-402 keeps the call ids OpenAI sent and a call with invalid arguments as text', async () => {
    const { provider } = await start('invalid-tool-arguments');

    const response = await provider.complete(contractRequest());

    expect(response.toolCalls).toEqual([
      { id: 'call_FAKE01', name: 'read_file', arguments: { path: 'src/Catalog.cs' } },
    ]);
    expect(response.text).toContain('Reading the file.');
    expect(response.text).toContain('{not json');
    expect(response.finishReason).toBe('tool_use');
  });

  it('RF-402 returns a refusal as the answer text', async () => {
    const { provider } = await start('refusal');

    const response = await provider.complete(contractRequest());

    expect(response).toMatchObject({ text: 'I cannot help with that.', finishReason: 'stop' });
  });
});

describe('OpenAiProvider answers it cannot use', () => {
  it('RF-402 an answer that is not a chat completion fails with RST-1506 and is not retried', async () => {
    const { provider, server } = await start('invalid-answer');

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed, httpStatus: 200 });
    expect(server.chatBodies()).toHaveLength(1);
  });

  it('RF-402 an answer larger than the size limit fails with RST-1506 and is not retried', async () => {
    const { provider, server } = await start('contract-text', { maxResponseBytes: 256 });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed });
    expect(error instanceof Error ? error.message : '').toContain('256 bytes');
    expect(server.chatBodies()).toHaveLength(1);
  });
});

describe('OpenAiProvider keys', () => {
  const pieces = [fakeOpenAiKey.slice(0, 12), fakeOpenAiKey.slice(12)];

  it.each([
    ['a newline', pieces.join('\n')],
    ['a carriage return', pieces.join('\r')],
    ['a tab', pieces.join('\t')],
    ['a space inside', pieces.join(' ')],
  ])('RNF-003 a key with %s is refused with RST-1511 and appears nowhere', async (_n, apiKey) => {
    const error = await failureOf(start('contract-text', { apiKey }));

    expect(error).toMatchObject({ code: ERROR_CODES.openAiKeyRejected });
    const shown = JSON.stringify(error, Object.getOwnPropertyNames(error));
    for (const part of pieces) expect(shown).not.toContain(part);
    expect(error instanceof Error ? error.cause : undefined).toBeUndefined();
  });
});

describe('OpenAiProvider keys beyond Latin-1', () => {
  const pieces = [fakeOpenAiKey.slice(0, 12), fakeOpenAiKey.slice(12)];
  const zeroWidthSpace = String.fromCodePoint(0x200b);
  const emoji = String.fromCodePoint(0x1f511);
  const firstAboveLatin1 = String.fromCodePoint(0x100);

  it.each([
    ['a zero-width space', pieces.join(zeroWidthSpace)],
    ['an emoji', pieces.join(emoji)],
    ['the first character above U+00FF', pieces.join(firstAboveLatin1)],
  ])('RNF-003 a key with %s is refused at construction with RST-1511', async (_n, apiKey) => {
    const logged = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );

    const error = await start('contract-text', { apiKey }).then(
      () => undefined,
      (failure: unknown) => failure,
    );

    expect(error).toMatchObject({ code: ERROR_CODES.openAiKeyRejected });
    const shown = JSON.stringify(error, Object.getOwnPropertyNames(error));
    for (const part of pieces) expect(shown).not.toContain(part);
    expect(error instanceof Error ? error.cause : undefined).toBeUndefined();
    for (const spy of logged) expect(spy).not.toHaveBeenCalled();
  });

  it('RNF-003 a key with U+00FF, the last character the check accepts, is built and sent', async () => {
    const apiKey = pieces.join(String.fromCodePoint(0xff));
    const { provider } = await start('contract-text', { apiKey });

    await expect(provider.complete(contractRequest())).resolves.toBeDefined();
  });
});
