import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LlmRequest } from '../../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { useFakeAnthropic } from '../../../../support/anthropic-harness.js';
import { failureOf } from '../../../../support/failure-of.js';
import { fakeAnthropicKey } from '../../../../support/secret-fixture.js';

// RF-404: the Anthropic adapter against a fake Anthropic server (ADR-008): tool calling, the
// stable prompt prefix marked for caching, and cached-token usage.

const start = useFakeAnthropic();

afterEach(() => {
  vi.unstubAllEnvs();
});

const cache = { type: 'ephemeral' } as const;

function firstBody(bodies: unknown[]): unknown {
  const [body] = bodies;
  if (body === undefined) throw new Error('no message body was received');
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
        content: 'Reading two files.',
        toolCalls: [
          { id: 'toolu_FAKE01', name: 'read_file', arguments: { path: 'a.cs' } },
          { id: 'toolu_FAKE02', name: 'read_file', arguments: { path: 'b.cs' } },
        ],
      },
      { role: 'tool', toolCallId: 'toolu_FAKE01', content: '1: class A {}' },
      { role: 'tool', toolCallId: 'toolu_FAKE02', content: '1: class B {}' },
    ],
  };
}

describe('AnthropicProvider requests', () => {
  it('RF-404 sends the system prompt, messages, tools and output limit without streaming', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete(contractRequest());

    expect(firstBody(server.messageBodies())).toEqual({
      model: 'contract-model',
      max_tokens: 512,
      system: [
        { type: 'text', text: 'You describe one area of a legacy codebase.', cache_control: cache },
      ],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Describe the Catalog area.', cache_control: cache }],
        },
      ],
      tools: [
        {
          name: 'read_file',
          description: 'Reads a line range of a file.',
          input_schema: { type: 'object', properties: { path: { type: 'string' } } },
        },
      ],
      stream: false,
    });
  });

  it('RF-404 marks the stable prefix for caching: the system prompt and the last message', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete(followUpRequest());

    const body = firstBody(server.messageBodies());
    expect(JSON.stringify(body).match(/cache_control/gu)).toHaveLength(2);
    expect(body).toMatchObject({
      system: [{ cache_control: cache }],
      messages: [
        { content: [{ type: 'text' }] },
        { role: 'assistant' },
        { content: [{ type: 'tool_result' }, { type: 'tool_result', cache_control: cache }] },
      ],
    });
  });
});

describe('AnthropicProvider conversation history', () => {
  it('RF-404 sends earlier tool calls as tool_use blocks and their results in one user turn', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete({ ...followUpRequest(), temperature: 0.2 });

    expect(firstBody(server.messageBodies())).toMatchObject({
      temperature: 0.2,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Describe the Catalog area.' }] },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Reading two files.' },
            { type: 'tool_use', id: 'toolu_FAKE01', name: 'read_file', input: { path: 'a.cs' } },
            { type: 'tool_use', id: 'toolu_FAKE02', name: 'read_file', input: { path: 'b.cs' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_FAKE01', content: '1: class A {}' },
            { type: 'tool_result', tool_use_id: 'toolu_FAKE02', content: '1: class B {}' },
          ],
        },
      ],
    });
  });

  it('RF-404 sends an assistant turn with only tool calls without an empty text block', async () => {
    const { provider, server } = await start('contract-text');
    const request = followUpRequest();
    const [first, assistant, ...rest] = request.messages;
    if (first === undefined || assistant?.role !== 'assistant') throw new Error('bad fixture');

    await provider.complete({
      ...request,
      messages: [first, { ...assistant, content: '' }, ...rest],
    });

    expect(firstBody(server.messageBodies())).toMatchObject({
      messages: [
        {},
        { role: 'assistant', content: [{ type: 'tool_use' }, { type: 'tool_use' }] },
        {},
      ],
    });
  });
});

describe('AnthropicProvider request headers and fields', () => {
  it('RF-404 sends no tools field when the call has no tools', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete({ ...contractRequest(), tools: [] });

    expect(firstBody(server.messageBodies())).not.toHaveProperty('tools');
  });

  it('RF-404 sends the key it was given and never one from the environment', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-key-must-not-be-sent');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'env-token-must-not-be-sent');
    vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', 'x-env-header: must-not-be-sent');
    const { provider, server } = await start('contract-text');

    await provider.complete(contractRequest());

    const [request] = server.received;
    expect(request?.headers['x-api-key']).toBe(fakeAnthropicKey);
    expect(request?.headers).not.toHaveProperty('authorization');
    expect(request?.headers).not.toHaveProperty('x-env-header');
  });

  it('RF-1603 a call without an output limit is refused before anything is sent', async () => {
    const { provider, server } = await start('contract-text');
    const { maxOutputTokens, ...request } = contractRequest();

    const error = await failureOf(provider.complete(request));

    expect(maxOutputTokens).toBe(512);
    expect(error).toMatchObject({ code: ERROR_CODES.outputLimitMissing });
    expect(server.received).toEqual([]);
  });
});
