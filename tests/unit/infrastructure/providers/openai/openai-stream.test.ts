import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { OpenAiProvider } from '../../../../../src/infrastructure/providers/openai/openai-provider.js';
import {
  chatCompletionStreamBody,
  isStreamed,
} from '../../../../../src/infrastructure/providers/openai/openai-request.js';
import { ProviderCallError } from '../../../../../src/infrastructure/providers/provider-call-error.js';
import { estimateInputTokens } from '../../../../../src/infrastructure/providers/usage-estimate.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf, nextStepOf } from '../../../../support/failure-of.js';
import { fakeOpenAiKey } from '../../../../support/secret-fixture.js';
import { loadStreamRecording, streamFetch } from '../../../../support/stream-recording.js';

// RF-402, Q-60: a call with a long answer streams it (with the final usage chunk), and the timeout
// of an attempt counts the time without a new token. The streams are recorded.

const longRequest = { ...contractRequest(), maxOutputTokens: 16_000 };

interface Limits {
  readonly timeoutSeconds: number;
  readonly maxRetries: number;
}

async function providerFor(recording: string, limits: Limits) {
  const replay = streamFetch(await loadStreamRecording(recording));
  const provider = new OpenAiProvider({
    apiKey: fakeOpenAiKey,
    baseUrl: 'http://127.0.0.1:9/v1',
    testMode: false,
    sleep: () => Promise.resolve(),
    random: () => 0.5,
    fetch: replay.fetch,
    ...limits,
  });
  return { provider, replay };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OpenAI: when a call streams', () => {
  it('Q-60 streams only when the output limit is above 8,192 tokens', () => {
    expect(isStreamed({ ...contractRequest(), maxOutputTokens: 8_192 })).toBe(false);
    expect(isStreamed({ ...contractRequest(), maxOutputTokens: 8_193 })).toBe(true);
    expect(isStreamed(contractRequest())).toBe(false);
  });

  it('Q-60 asks for the usage chunk of a stream', () => {
    const body = chatCompletionStreamBody(longRequest);

    expect(body).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  it('Q-60 reads a streamed answer into the same answer a plain call gives', async () => {
    const { provider, replay } = await providerFor('openai-text', {
      timeoutSeconds: 120,
      maxRetries: 0,
    });

    const answer = await provider.complete(longRequest);

    expect(replay.bodies).toEqual([
      expect.objectContaining({ stream: true, stream_options: { include_usage: true } }),
    ]);
    expect(answer).toMatchObject({
      text: 'The Catalog area lists products from the database.',
      finishReason: 'stop',
      requestId: 'req_FAKE00000000000000000001',
      modelVersion: 'contract-model-2026-08-07',
      usage: {
        ...{ inputTokens: 1200, outputTokens: 80, cachedInputTokens: 1024 },
        usageSource: 'reported',
      },
    });
  });

  it('Q-60 puts the pieces of a streamed tool call together', async () => {
    const { provider } = await providerFor('openai-tool-call', {
      timeoutSeconds: 120,
      maxRetries: 0,
    });

    const answer = await provider.complete(longRequest);

    expect(answer.finishReason).toBe('tool_use');
    expect(answer.toolCalls).toEqual([
      { id: 'call_FAKE00000000000001', name: 'read_file', arguments: { path: 'src/app.ts' } },
    ]);
  });
});

describe('OpenAI: the timeout counts the time without a token', () => {
  it('Q-60 keeps the answer of a stream that takes 300 s with a token every second', async () => {
    const { provider } = await providerFor('openai-long', { timeoutSeconds: 120, maxRetries: 0 });
    const call = provider.complete(longRequest);

    await vi.advanceTimersByTimeAsync(301_000);
    const answer = await call;

    expect(answer.text).toBe('token '.repeat(300));
    expect(answer.usage).toMatchObject({ outputTokens: 300, usageSource: 'reported' });
  });

  it('RST-1505 ends a stream idle for longer than the timeout and meters it as estimated', async () => {
    const { provider } = await providerFor('openai-idle', { timeoutSeconds: 120, maxRetries: 0 });
    const outcome = failureOf(provider.complete(longRequest));

    await vi.advanceTimersByTimeAsync(121_000);
    const error = await outcome;

    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error).toMatchObject({ code: ERROR_CODES.providerTimeout });
    expect(error).toMatchObject({
      usage: {
        inputTokens: estimateInputTokens(longRequest),
        outputTokens: 7,
        usageSource: 'estimated',
        outputUnknown: true,
      },
    });
  });

  it('Q-60 sends a call that times out twice no third time and names the setting to raise', async () => {
    const { provider, replay } = await providerFor('openai-silent', {
      timeoutSeconds: 120,
      maxRetries: 3,
    });
    const outcome = failureOf(provider.complete(longRequest));

    await vi.advanceTimersByTimeAsync(300_000);
    const error = await outcome;

    expect(replay.bodies).toHaveLength(2);
    expect(error).toMatchObject({ code: ERROR_CODES.providerTimeout });
    expect(nextStepOf(error)).toContain('timeoutSeconds');
  });
});
