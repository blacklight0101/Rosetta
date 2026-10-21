import { describe, expect, it } from 'vitest';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { useFakeOpenAi } from '../../../../support/openai-harness.js';

// RF-402, Q-58, P3-86: the OpenAI adapter sends the role's reasoning effort as `reasoning_effort`
// only when the request carries one, and reports the reasoning tokens apart from the output.
// Parameter source: developers.openai.com/api/docs/guides/reasoning (`reasoning_effort` for Chat
// Completions) and the Chat Completions reference (`max_completion_tokens` includes reasoning).

const start = useFakeOpenAi();

function firstBody(bodies: unknown[]): unknown {
  const [body] = bodies;
  if (body === undefined) throw new Error('no chat completion body was received');
  return body;
}

describe('OpenAiProvider reasoning effort', () => {
  it('RF-402 sends reasoning_effort when the request carries an effort', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete({ ...contractRequest(), reasoningEffort: 'low' });

    expect(firstBody(server.chatBodies())).toMatchObject({
      reasoning_effort: 'low',
      max_completion_tokens: 512,
    });
  });

  it.each(['medium', 'high'] as const)('RF-402 sends the effort %s as given', async (effort) => {
    const { provider, server } = await start('contract-text');

    await provider.complete({ ...contractRequest(), reasoningEffort: effort });

    expect(firstBody(server.chatBodies())).toMatchObject({ reasoning_effort: effort });
  });

  it('RF-402 sends no reasoning_effort when the request carries none', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete(contractRequest());

    expect(firstBody(server.chatBodies())).not.toHaveProperty('reasoning_effort');
  });
});

describe('OpenAiProvider reasoning tokens', () => {
  it('RF-402 a recorded gpt-5-nano answer with empty content at the limit keeps its reasoning tokens inside the output tokens', async () => {
    const { provider } = await start('reasoning-empty-at-limit');

    const answer = await provider.complete(contractRequest());

    expect(answer.text).toBe('');
    expect(answer.finishReason).toBe('length');
    expect(answer.usage.outputTokens).toBe(4096);
    expect(answer.usage.reasoningTokens).toBe(4096);
    expect(answer.usage.usageSource).toBe('reported');
  });

  it('RF-402 an answer without a reasoning count reports none', async () => {
    const { provider } = await start('cached-details-missing');

    const answer = await provider.complete(contractRequest());

    expect(answer.usage.reasoningTokens).toBeUndefined();
  });

  it('RF-402 an answer that reports zero reasoning tokens reports none', async () => {
    const { provider } = await start('contract-text');

    const answer = await provider.complete(contractRequest());

    expect(answer.usage.reasoningTokens).toBeUndefined();
  });
});
