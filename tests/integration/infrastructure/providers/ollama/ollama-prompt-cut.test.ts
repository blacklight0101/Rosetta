import { describe, expect, it } from 'vitest';
import { useFakeOllama } from '../../../../support/ollama-harness.js';
import { smallOutput } from '../../../../support/ollama-prompt-size.js';

// RF-401, RF-421, DEC-155: a prompt whose estimate fits the context is never failed after the
// call, whatever count Ollama reports: with a KV cache hit it counts only the new tokens (ADR-008).

const start = useFakeOllama();

describe('OllamaProvider with a prompt that fits and a small reported count', () => {
  it('RF-401 answers a multi-turn conversation at 90 percent of a fixed context (cache hit)', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 2048 });
    const request = smallOutput(1843);
    const turns = [
      ...request.messages,
      { role: 'assistant' as const, content: 'I read the file.' },
      { role: 'user' as const, content: 'Go on.' },
    ];

    const response = await provider.complete({ ...request, messages: turns });

    expect(response.usage.inputTokens).toBe(900);
  });

  it('RF-401 answers a prompt that fills the context but for the output reserve', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 2048 });

    const response = await provider.complete(smallOutput(1948));

    expect(response.usage.inputTokens).toBe(900);
  });

  it('RF-401 answers at 90 percent of an auto context', async () => {
    const { provider } = await start('prompt-cut-auto');

    const response = await provider.complete(smallOutput(7373));

    expect(response.usage.inputTokens).toBe(900);
  });

  it('RF-401 answers a large prompt whose reported count agrees with the estimate', async () => {
    const { provider } = await start('prompt-counted-full', { contextTokens: 2048 });

    const response = await provider.complete(smallOutput(1900));

    expect(response.usage.inputTokens).toBe(1900);
  });

  it('RF-401 RF-421 answers a large prompt when Ollama reports no counts', async () => {
    const { provider } = await start('usage-missing', { contextTokens: 2048 });

    const response = await provider.complete(smallOutput(1900));

    expect(response.usage.usageSource).toBe('estimated');
  });
});
