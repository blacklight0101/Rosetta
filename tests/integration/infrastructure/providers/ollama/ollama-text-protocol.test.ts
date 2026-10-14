import { describe, expect, it } from 'vitest';
import type { LlmRequest } from '../../../../../src/application/ports/llm-provider.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { useFakeOllama } from '../../../../support/ollama-harness.js';

// RF-205, RF-401: models without native tool calling use the JSON-in-text protocol
// (`toolMode: text`), parsed with the same validation as native calls (ADR-008: fake server).

const start = useFakeOllama();

function readerRequest(): LlmRequest {
  return { ...contractRequest(), model: 'gemma4:e4b' };
}

function firstChatBody(bodies: unknown[]): { system: string; keys: string[] } {
  const [body] = bodies;
  if (typeof body !== 'object' || body === null) throw new Error('no chat body was received');
  const messages: unknown = Reflect.get(body, 'messages');
  const first: unknown = Array.isArray(messages) ? messages[0] : undefined;
  const system: unknown =
    typeof first === 'object' && first !== null ? Reflect.get(first, 'content') : '';
  return { system: typeof system === 'string' ? system : '', keys: Object.keys(body) };
}

describe('OllamaProvider with the text tool protocol', () => {
  it('RF-205 requests tool calls in plain text and parses the JSON blocks as tool calls', async () => {
    const { provider, server } = await start('text-hostile-tool-calls', { toolMode: 'text' });

    const response = await provider.complete(readerRequest());

    const { system, keys } = firstChatBody(server.chatBodies());
    expect(keys).not.toContain('tools');
    expect(system).toContain('You describe one area of a legacy codebase.');
    expect(system).toContain('"name": "read_file"');
    expect(system).toContain('```tool_call');
    expect(response.finishReason).toBe('tool_use');
    expect(response.toolCalls.map((call) => call.name)).toEqual([
      'read_file',
      'read_file',
      'open_file',
    ]);
    expect(response.text).toBe('I will read the catalog first.');
  });

  it('RF-205 text-protocol tool calls get the same validation as native ones', async () => {
    const native = await start('native-hostile-tool-calls', { toolMode: 'native' });
    const text = await start('text-hostile-tool-calls', { toolMode: 'text' });

    const fromNative = await native.provider.complete(readerRequest());
    const fromText = await text.provider.complete(readerRequest());

    expect(fromText.toolCalls).toEqual(fromNative.toolCalls);
    expect(fromText.toolCalls[0]?.arguments).toEqual({
      path: 'src/Catalog.cs',
      startLine: '12',
      endLine: '40',
    });
    expect(fromText.toolCalls[1]?.arguments).toEqual({
      path: 'src/Invented/Nope.cs',
      range: '10‑20',
    });
  });
});

describe('OllamaProvider text protocol history and final answers', () => {
  it('RF-205 a final answer keeps its JSON card block and a malformed tool block as text', async () => {
    const { provider } = await start('text-final-answer', { toolMode: 'text' });

    const response = await provider.complete(readerRequest());

    expect(response.toolCalls).toEqual([]);
    expect(response.finishReason).toBe('stop');
    expect(response.text).toContain('"cards"');
    expect(response.text).toContain('```tool_call');
    expect(response.text).not.toContain('The answer is ready.');
  });

  it('RF-205 earlier tool calls and results are sent back as text, not as tool messages', async () => {
    const { provider, server } = await start('contract-text', { toolMode: 'text' });
    const request = contractRequest();

    await provider.complete({
      ...request,
      messages: [
        ...request.messages,
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'src/Catalog.cs' } }],
        },
        { role: 'tool', toolCallId: 'call-1', content: 'class Catalog {}' },
      ],
    });

    const [body] = server.chatBodies();
    const messages: unknown =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'messages') : [];
    expect(messages).toEqual([
      expect.objectContaining({ role: 'system' }),
      { role: 'user', content: 'Describe the Catalog area.' },
      {
        role: 'assistant',
        content: '```tool_call\n{"name":"read_file","arguments":{"path":"src/Catalog.cs"}}\n```',
      },
      {
        role: 'user',
        content: '```tool_result\nid: call-1\ncontent:\nclass Catalog {}\n```',
      },
    ]);
  });
});
