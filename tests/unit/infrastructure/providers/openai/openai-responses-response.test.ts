import { describe, expect, it } from 'vitest';
import { llmResponseOfResponses } from '../../../../../src/infrastructure/providers/openai/openai-responses-response.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';

// P3-131, RF-402, RF-421: a Responses answer in the port's shape.

const context = { request: contractRequest(), requestId: 'req_FAKE1' };
const usage = {
  input_tokens: 900,
  input_tokens_details: { cached_tokens: 512, cache_write_tokens: 0 },
  output_tokens: 50,
  output_tokens_details: { reasoning_tokens: 20 },
};
const message = (text: string) => ({
  type: 'message',
  content: [{ type: 'output_text', text }],
});

describe('a Responses answer', () => {
  it('P3-131 reads text, usage with cached and reasoning tokens, and the model version', () => {
    const answer = llmResponseOfResponses(
      { model: 'm-2026', status: 'completed', output: [message('Hello')], usage },
      context,
    );

    expect(answer).toMatchObject({
      text: 'Hello',
      toolCalls: [],
      finishReason: 'stop',
      modelVersion: 'm-2026',
      requestId: 'req_FAKE1',
      usage: {
        inputTokens: 900,
        outputTokens: 50,
        cachedInputTokens: 512,
        reasoningTokens: 20,
        usageSource: 'reported',
      },
    });
  });

  it('P3-131 reads a function call by its call_id with parsed arguments as tool_use', () => {
    const answer = llmResponseOfResponses(
      {
        model: 'm',
        status: 'completed',
        output: [
          { type: 'reasoning', id: 'rs_1', summary: [] },
          {
            type: 'function_call',
            id: 'fc_1',
            call_id: 'call_9',
            name: 'read_file',
            arguments: '{"path":"a"}',
          },
        ],
        usage,
      },
      context,
    );

    expect(answer?.toolCalls).toEqual([
      { id: 'call_9', name: 'read_file', arguments: { path: 'a' } },
    ]);
    expect(answer?.finishReason).toBe('tool_use');
  });
});

describe('a Responses answer: limits and odd content', () => {
  it('P3-131 reports status incomplete with reason max_output_tokens as length', () => {
    const answer = llmResponseOfResponses(
      {
        model: 'm',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [message('cut')],
        usage,
      },
      context,
    );

    expect(answer).toMatchObject({ text: 'cut', finishReason: 'length' });
  });
});

describe('a Responses answer: untrusted content', () => {
  it('P3-131 keeps a call with invalid arguments as text and a refusal as the answer', () => {
    const answer = llmResponseOfResponses(
      {
        model: 'm',
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'refusal', refusal: 'No.' }] },
          { type: 'function_call', call_id: 'c', name: 'read_file', arguments: '{not json' },
        ],
        usage,
      },
      context,
    );

    expect(answer?.toolCalls).toEqual([]);
    expect(answer?.text).toContain('No.');
    expect(answer?.text).toContain('{not json');
  });

  it('P3-131 estimates the usage when none is reported and refuses a body that is no response', () => {
    const answer = llmResponseOfResponses(
      { model: 'm', status: 'completed', output: [message('abc')] },
      context,
    );

    expect(answer?.usage.usageSource).toBe('estimated');
    expect(llmResponseOfResponses({ unexpected: true }, context)).toBeUndefined();
  });
});
