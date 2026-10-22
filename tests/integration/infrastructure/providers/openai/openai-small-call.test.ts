import { describe, expect, it } from 'vitest';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { useFakeOpenAi } from '../../../../support/openai-harness.js';

// RF-402, Q-60: a call whose answer is short is not streamed, as before.

const start = useFakeOpenAi();

describe('OpenAI: a small call', () => {
  it('Q-60 is sent without a stream, as before', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete({ ...contractRequest(), maxOutputTokens: 8_192 });

    const [body] = server.received.map((request) => request.body);
    expect(body).toMatchObject({ stream: false, max_completion_tokens: 8_192 });
    expect(body).not.toHaveProperty('stream_options');
  });
});
