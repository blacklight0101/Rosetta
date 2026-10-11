import { describe, expect, it } from 'vitest';
import { llmResponseOf } from '../../../../../src/infrastructure/providers/openai/openai-response.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';

// RF-402, RF-421: OpenAI's chat completion in the port's one shape.

function completion(
  message: Record<string, unknown>,
  extra: Record<string, unknown> = {},
  finishReason = 'stop',
) {
  return {
    id: 'chatcmpl-FAKE01',
    model: 'gpt-test-2026-08-07',
    choices: [
      { index: 0, message: { role: 'assistant', ...message }, finish_reason: finishReason },
    ],
    usage: {
      prompt_tokens: 2048,
      completion_tokens: 12,
      prompt_tokens_details: { cached_tokens: 1536 },
    },
    ...extra,
  };
}

const context = { request: contractRequest(), requestId: 'req_FAKE01' };

describe('OpenAI answers', () => {
  it('RF-402 reads text, usage with cached tokens, the dated model id and the request id', () => {
    const response = llmResponseOf(completion({ content: 'Hello.' }), context);

    expect(response).toEqual({
      text: 'Hello.',
      toolCalls: [],
      usage: {
        inputTokens: 2048,
        outputTokens: 12,
        cachedInputTokens: 1536,
        usageSource: 'reported',
      },
      finishReason: 'stop',
      requestId: 'req_FAKE01',
      modelVersion: 'gpt-test-2026-08-07',
      metrics: { httpStatus: 200 },
    });
  });

  it('RF-402 leaves the request id out when OpenAI sent none', () => {
    const response = llmResponseOf(completion({ content: 'Hello.' }), {
      request: contractRequest(),
      requestId: undefined,
    });

    expect(response).not.toHaveProperty('requestId');
  });
});

describe('OpenAI answer tool calls and refusals', () => {
  it('RF-402 reads tool calls with their own ids and JSON-string arguments', () => {
    const toolCalls = [
      {
        id: 'call_FAKE01',
        type: 'function',
        function: { name: 'list_files', arguments: '{"dir":"src"}' },
      },
      { type: 'function', function: { name: 'read_file', arguments: '{}' } },
    ];

    const response = llmResponseOf(completion({ content: null, tool_calls: toolCalls }), context);

    expect(response?.toolCalls).toEqual([
      { id: 'call_FAKE01', name: 'list_files', arguments: { dir: 'src' } },
      { id: 'call-2', name: 'read_file', arguments: {} },
    ]);
    expect(response?.finishReason).toBe('tool_use');
  });

  it('RF-402 treats a content filter stop as stop', () => {
    const body = completion({ content: '' }, {}, 'content_filter');

    expect(llmResponseOf(body, context)?.finishReason).toBe('stop');
  });

  it('RF-421 a usage without completion tokens is estimated and marked estimated', () => {
    const body = completion(
      { content: 'twelve chars' },
      { usage: { prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 40 } } },
    );

    expect(llmResponseOf(body, context)?.usage).toEqual({
      inputTokens: 100,
      outputTokens: 3,
      cachedInputTokens: 40,
      usageSource: 'estimated',
    });
  });

  it('RF-421 a usage without prompt tokens is estimated and marked estimated', () => {
    const body = completion({ content: 'x' }, { usage: { completion_tokens: 7 } });

    const usage = llmResponseOf(body, context)?.usage;

    expect(usage).toMatchObject({ outputTokens: 7, usageSource: 'estimated' });
    expect(usage?.inputTokens).toBeGreaterThan(0);
  });
});

describe('OpenAI answer validation', () => {
  it.each([
    ['no choices', { model: 'gpt-test', choices: [] }],
    ['no model', { choices: [{ message: { content: 'x' } }] }],
    ['a string', 'Internal error'],
    ['negative tokens', completion({ content: 'x' }, { usage: { prompt_tokens: -1 } })],
  ])('RF-402 refuses an answer with %s', (_name, body) => {
    expect(llmResponseOf(body, context)).toBeUndefined();
  });
});
