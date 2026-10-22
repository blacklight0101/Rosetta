import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { AnthropicProvider } from '../../../../../src/infrastructure/providers/anthropic/anthropic-provider.js';
import { isStreamed } from '../../../../../src/infrastructure/providers/anthropic/anthropic-request.js';
import { ProviderCallError } from '../../../../../src/infrastructure/providers/provider-call-error.js';
import { estimateInputTokens } from '../../../../../src/infrastructure/providers/usage-estimate.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf, nextStepOf } from '../../../../support/failure-of.js';
import { fakeAnthropicKey } from '../../../../support/secret-fixture.js';
import { loadStreamRecording, streamFetch } from '../../../../support/stream-recording.js';

// RF-404, Q-60: a call with a long answer streams it, and the timeout of an attempt counts the
// time without a new token, not the whole answer. The streams are recorded; the fake clock runs a
// 300 s stream in no time.

const longRequest = { ...contractRequest(), maxOutputTokens: 16_000 };

interface Limits {
  readonly timeoutSeconds: number;
  readonly maxRetries: number;
}

async function providerFor(recording: string, limits: Limits) {
  const replay = streamFetch(await loadStreamRecording(recording));
  const provider = new AnthropicProvider({
    apiKey: fakeAnthropicKey,
    baseUrl: 'http://127.0.0.1:9',
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

describe('Anthropic: when a call streams', () => {
  it('Q-60 asks for a stream only when the output limit is above 8,192 tokens', () => {
    expect(isStreamed(8_192)).toBe(false);
    expect(isStreamed(8_193)).toBe(true);
  });

  it('Q-60 reads a streamed answer into the same answer a plain call gives', async () => {
    const { provider, replay } = await providerFor('anthropic-text', {
      timeoutSeconds: 120,
      maxRetries: 0,
    });

    const answer = await provider.complete(longRequest);

    expect(replay.bodies).toEqual([expect.objectContaining({ stream: true, max_tokens: 16_000 })]);
    expect(answer).toMatchObject({
      text: 'The Catalog area lists products from the database.',
      finishReason: 'stop',
      requestId: 'req_FAKE00000000000000000001',
      usage: {
        ...{ inputTokens: 1200, outputTokens: 80, cachedInputTokens: 1024 },
        usageSource: 'reported',
      },
    });
  });
});

describe('Anthropic: the timeout counts the time without a token', () => {
  it('Q-60 keeps the answer of a stream that takes 300 s with a token every second', async () => {
    const { provider } = await providerFor('anthropic-long', {
      timeoutSeconds: 120,
      maxRetries: 0,
    });
    const call = provider.complete(longRequest);

    await vi.advanceTimersByTimeAsync(301_000);
    const answer = await call;

    expect(answer.text).toBe('token '.repeat(300));
    expect(answer.usage).toMatchObject({ outputTokens: 300, usageSource: 'reported' });
  });

  it('RST-1505 ends a stream idle for longer than the timeout and meters it as estimated', async () => {
    const { provider } = await providerFor('anthropic-idle', {
      timeoutSeconds: 120,
      maxRetries: 0,
    });
    const outcome = failureOf(provider.complete(longRequest));

    await vi.advanceTimersByTimeAsync(121_000);
    const error = await outcome;

    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error).toMatchObject({ code: ERROR_CODES.providerTimeout });
    expect(error).toMatchObject({
      usage: {
        inputTokens: estimateInputTokens(longRequest),
        outputTokens: 7,
        cachedInputTokens: 0,
        usageSource: 'estimated',
        outputUnknown: true,
      },
    });
  });

  it('Q-60 does not count a ping as a token', async () => {
    const { provider } = await providerFor('anthropic-ping-only', {
      timeoutSeconds: 120,
      maxRetries: 0,
    });
    const outcome = failureOf(provider.complete(longRequest));

    await vi.advanceTimersByTimeAsync(121_000);

    expect(await outcome).toMatchObject({ code: ERROR_CODES.providerTimeout });
  });
});

describe('Anthropic: a call that timed out', () => {
  it('Q-60 meters a timed-out call that never answered with its input estimated', async () => {
    const { provider } = await providerFor('anthropic-silent', {
      timeoutSeconds: 30,
      maxRetries: 0,
    });
    const outcome = failureOf(provider.complete(contractRequest()));

    await vi.advanceTimersByTimeAsync(31_000);

    expect(await outcome).toMatchObject({
      usage: {
        inputTokens: estimateInputTokens(contractRequest()),
        outputTokens: 0,
        usageSource: 'estimated',
        outputUnknown: true,
      },
    });
  });

  it('Q-60 sends a call that times out twice no third time and names the setting to raise', async () => {
    const { provider, replay } = await providerFor('anthropic-silent', {
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
