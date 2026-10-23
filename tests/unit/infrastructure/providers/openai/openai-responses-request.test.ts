import { describe, expect, it } from 'vitest';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import {
  responsesBody,
  responsesStreamBody,
} from '../../../../../src/infrastructure/providers/openai/openai-responses-request.js';
import { chatCompletionBody } from '../../../../../src/infrastructure/providers/openai/openai-request.js';
import type { LlmRequest } from '../../../../../src/application/ports/llm-provider.js';

// P3-131, RF-402: the body of a Responses call (POST /v1/responses, developers.openai.com Responses
// API): `instructions`, `input` items, function tools, `reasoning.effort`, `max_output_tokens`,
// `store: false`. Earlier turns travel as items: messages, `function_call` items with their
// `call_id` and JSON-string arguments, `function_call_output` items answering by `call_id`.

function turn(assistantText: string): LlmRequest {
  return {
    ...contractRequest(),
    messages: [
      { role: 'user', content: 'Describe the Catalog area.' },
      {
        role: 'assistant',
        content: assistantText,
        toolCalls: [{ id: 'call_FAKE01', name: 'read_file', arguments: { path: 'src/a.cs' } }],
      },
      { role: 'tool', toolCallId: 'call_FAKE01', content: 'line 1' },
    ],
  };
}

describe('the Responses request body', () => {
  it('P3-131 sends instructions, input items, function tools, the output limit and store false', () => {
    const body = responsesBody({ ...contractRequest(), reasoningEffort: 'low' });

    expect(body).toEqual({
      model: 'contract-model',
      instructions: 'You describe one area of a legacy codebase.',
      input: [{ role: 'user', content: 'Describe the Catalog area.' }],
      tools: [
        {
          type: 'function',
          name: 'read_file',
          description: 'Reads a line range of a file.',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
          strict: false,
        },
      ],
      max_output_tokens: 512,
      reasoning: { effort: 'low' },
      store: false,
      stream: false,
    });
  });

  it('P3-131 carries earlier turns as function_call and function_call_output items by call id', () => {
    const body = responsesBody(turn('Reading.'));

    expect(body.input).toEqual([
      { role: 'user', content: 'Describe the Catalog area.' },
      { role: 'assistant', content: 'Reading.' },
      {
        type: 'function_call',
        call_id: 'call_FAKE01',
        name: 'read_file',
        arguments: '{"path":"src/a.cs"}',
      },
      { type: 'function_call_output', call_id: 'call_FAKE01', output: 'line 1' },
    ]);
  });

  it('P3-131 leaves out the assistant message item when the turn had no text', () => {
    expect(responsesBody(turn('')).input).toHaveLength(3);
  });
});

describe('the Responses request body: options', () => {
  it('P3-131 sends no temperature unless the role sets one, and no reasoning without an effort', () => {
    expect(responsesBody(contractRequest())).not.toHaveProperty('temperature');
    expect(responsesBody(contractRequest())).not.toHaveProperty('reasoning');
    expect(responsesBody({ ...contractRequest(), temperature: 0.2 })).toMatchObject({
      temperature: 0.2,
    });
  });

  it('P3-131 asks for a stream without the Chat Completions stream options', () => {
    const body = responsesStreamBody({ ...contractRequest(), maxOutputTokens: 16_000 });

    expect(body).toMatchObject({ stream: true, store: false, max_output_tokens: 16_000 });
    expect(body).not.toHaveProperty('stream_options');
  });

  it('P3-131 is not the Chat Completions body', () => {
    const chat = chatCompletionBody(contractRequest());
    const responses = responsesBody(contractRequest());

    expect(chat).toHaveProperty('messages');
    expect(responses).not.toHaveProperty('messages');
    expect(responses).not.toHaveProperty('max_completion_tokens');
  });
});
