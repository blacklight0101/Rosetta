import { describe, expect, it } from 'vitest';
import { chatCompletionBody } from '../../../../../src/infrastructure/providers/openai/openai-request.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';

// RF-402: the body of one OpenAI chat completion call.

describe('OpenAI request body', () => {
  it('RF-402 leaves out the output limit and temperature when the role sets none', () => {
    const { context, model, system, messages, tools, signal } = contractRequest();

    const body = chatCompletionBody({ context, model, system, messages, tools, signal });

    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('temperature');
  });

  it('RF-402 keeps the text of an assistant message that also called tools', () => {
    const body = chatCompletionBody({
      ...contractRequest(),
      messages: [
        {
          role: 'assistant',
          content: 'Reading it.',
          toolCalls: [{ id: 'call_FAKE01', name: 'read_file', arguments: {} }],
        },
      ],
    });

    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: 'Reading it.',
      tool_calls: [
        { id: 'call_FAKE01', type: 'function', function: { name: 'read_file', arguments: '{}' } },
      ],
    });
  });

  it('RF-402 sends a plain assistant message as text', () => {
    const body = chatCompletionBody({
      ...contractRequest(),
      messages: [{ role: 'assistant', content: 'Done.' }],
    });

    expect(body.messages[1]).toEqual({ role: 'assistant', content: 'Done.' });
  });
});
