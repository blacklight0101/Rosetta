import { describe, expect, it } from 'vitest';
import type { LlmRequest } from '../../../../../src/application/ports/llm-provider.js';
import {
  chatBody,
  type ChatSettings,
} from '../../../../../src/infrastructure/providers/ollama/ollama-request.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';

// RF-401, RF-205: the body of one Ollama /api/chat call.

const native: ChatSettings = {
  toolMode: 'native',
  contextTokens: 32768,
  think: false,
  textProtocolPrompt: 'Tools: {{tools}}',
};

function withHistory(): LlmRequest {
  const request = contractRequest();
  return {
    ...request,
    temperature: 0.2,
    messages: [
      ...request.messages,
      {
        role: 'assistant',
        content: 'Reading.',
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'a.cs' } }],
      },
      { role: 'tool', toolCallId: 'call-1', content: 'class A {}' },
      { role: 'tool', toolCallId: 'call-9', content: 'unknown call' },
    ],
  };
}

describe('Ollama chat body', () => {
  it('RF-401 a native call sends the tools, the history with tool names and the options', () => {
    expect(chatBody(withHistory(), native)).toEqual({
      model: 'contract-model',
      stream: false,
      think: false,
      options: { num_ctx: 32768, num_predict: 512, temperature: 0.2 },
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
      messages: [
        { role: 'system', content: 'You describe one area of a legacy codebase.' },
        { role: 'user', content: 'Describe the Catalog area.' },
        {
          role: 'assistant',
          content: 'Reading.',
          tool_calls: [{ function: { name: 'read_file', arguments: { path: 'a.cs' } } }],
        },
        { role: 'tool', content: 'class A {}', tool_name: 'read_file' },
        { role: 'tool', content: 'unknown call' },
      ],
    });
  });

  it('RF-401 a call without tools sends no tools and no output limit when none is set', () => {
    const { maxOutputTokens: _unused, ...request } = contractRequest();

    const body = chatBody({ ...request, tools: [] }, native);

    expect(body).not.toHaveProperty('tools');
    expect(body.options).toEqual({ num_ctx: 32768 });
  });

  it('RF-205 a text-mode call sends no tools and puts the protocol in the system prompt', () => {
    const body = chatBody(withHistory(), { ...native, toolMode: 'text', think: true });

    expect(body).not.toHaveProperty('tools');
    expect(body.think).toBe(true);
    expect(body.messages[0]?.content).toContain('Tools: [');
    expect(body.messages.slice(2)).toEqual([
      {
        role: 'assistant',
        content: 'Reading.\n\n```tool_call\n{"name":"read_file","arguments":{"path":"a.cs"}}\n```',
      },
      { role: 'user', content: '```tool_result\n{"id":"call-1","content":"class A {}"}\n```' },
      { role: 'user', content: '```tool_result\n{"id":"call-9","content":"unknown call"}\n```' },
    ]);
  });
});
