import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { OpenAiProvider } from '../../../../../src/infrastructure/providers/openai/openai-provider.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../../support/failure-of.js';
import { fakeOpenAiKey } from '../../../../support/secret-fixture.js';
import { loadStreamRecording, streamFetch } from '../../../../support/stream-recording.js';

// P3-131, Q-60, P5-03: a Responses call with a long answer streams it (response.output_text.delta,
// response.function_call_arguments.delta, response.completed or response.incomplete with the
// usage). The streams are recorded.

const longRequest = {
  ...contractRequest(),
  maxOutputTokens: 16_000,
  reasoningEffort: 'low',
} as const;

async function providerFor(recording: string) {
  const replay = streamFetch(await loadStreamRecording(recording));
  const provider = new OpenAiProvider({
    apiKey: fakeOpenAiKey,
    baseUrl: 'http://127.0.0.1:9/v1',
    testMode: false,
    timeoutSeconds: 120,
    maxRetries: 0,
    sleep: () => Promise.resolve(),
    random: () => 0.5,
    fetch: replay.fetch,
    usesResponses: () => true,
  });
  return { provider, replay };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OpenAI Responses: a streamed answer', () => {
  it('Q-60 asks for a stream with store false and the Responses body', async () => {
    const { provider, replay } = await providerFor('openai-responses-text');

    await provider.complete(longRequest);

    expect(replay.bodies).toEqual([
      expect.objectContaining({ stream: true, store: false, reasoning: { effort: 'low' } }),
    ]);
    expect(replay.bodies[0]).not.toHaveProperty('messages');
  });

  it('Q-60 reads text, usage with cached tokens, and the request id', async () => {
    const { provider } = await providerFor('openai-responses-text');

    const answer = await provider.complete(longRequest);

    expect(answer).toMatchObject({
      text: 'The Catalog area lists products from the database.',
      finishReason: 'stop',
      requestId: 'req_FAKE00000000000000000001',
      modelVersion: 'contract-model-2026-08-07',
      usage: { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 1024, reasoningTokens: 10 },
    });
  });

  it('Q-60 puts a streamed function call together', async () => {
    const { provider } = await providerFor('openai-responses-tool-call');

    const answer = await provider.complete(longRequest);

    expect(answer.finishReason).toBe('tool_use');
    expect(answer.toolCalls).toEqual([
      { id: 'call_FAKE00000000000001', name: 'read_file', arguments: { path: 'src/app.ts' } },
    ]);
  });
});

describe('OpenAI Responses: a streamed answer that ends early', () => {
  it('P5-03 reports a streamed answer cut at the output limit as length', async () => {
    const { provider } = await providerFor('openai-responses-length');

    const answer = await provider.complete(longRequest);

    expect(answer).toMatchObject({ text: 'The Catalog area lists', finishReason: 'length' });
    expect(answer.usage.outputTokens).toBe(16_000);
  });

  it('RF-406 a stream that ends with response.failed is a failed call', async () => {
    const { provider } = await providerFor('openai-responses-failed');

    const error = await failureOf(provider.complete(longRequest));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed });
  });
});
