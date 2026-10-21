import { describe, expect, it } from 'vitest';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { useFakeAnthropic } from '../../../../support/anthropic-harness.js';

// RF-404, Q-58, P3-86: the Anthropic adapter sends the role's effort as `output_config.effort`
// only when the request carries one, and reports the thinking tokens apart from the output.
// Parameter source: platform.claude.com/docs/en/build-with-claude/effort (`output_config.effort`,
// no beta header) and the Messages API reference (`usage.output_tokens_details.thinking_tokens`,
// a part of `output_tokens`).

const start = useFakeAnthropic();

function firstBody(bodies: unknown[]): unknown {
  const [body] = bodies;
  if (body === undefined) throw new Error('no message body was received');
  return body;
}

describe('AnthropicProvider effort', () => {
  it.each(['low', 'medium', 'high'] as const)(
    'RF-404 sends output_config.effort %s when the request carries it',
    async (effort) => {
      const { provider, server } = await start('contract-text');

      await provider.complete({ ...contractRequest(), reasoningEffort: effort });

      expect(firstBody(server.messageBodies())).toMatchObject({ output_config: { effort } });
    },
  );

  it('RF-404 sends no output_config when the request carries no effort', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete(contractRequest());

    expect(firstBody(server.messageBodies())).not.toHaveProperty('output_config');
  });
});

describe('AnthropicProvider thinking tokens', () => {
  it('RF-404 reports the thinking tokens inside the output tokens', async () => {
    const { provider } = await start('thinking-tokens');

    const answer = await provider.complete(contractRequest());

    expect(answer.usage.outputTokens).toBe(900);
    expect(answer.usage.reasoningTokens).toBe(700);
  });

  it('RF-404 an answer without a thinking count reports none', async () => {
    const { provider } = await start('contract-text');

    const answer = await provider.complete(contractRequest());

    expect(answer.usage.reasoningTokens).toBeUndefined();
  });
});
