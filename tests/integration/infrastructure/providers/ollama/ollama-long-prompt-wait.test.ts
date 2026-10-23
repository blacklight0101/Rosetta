import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstTokenWaitMs } from '../../../../../src/infrastructure/providers/prompt-wait.js';
import { useFakeOllama } from '../../../../support/ollama-harness.js';
import { requestOf } from '../../../../support/ollama-prompt-size.js';

// RF-401, RF-406, P3-113, EV-29: the chat request of a long prompt is given a longer timeout than
// the one of a short prompt, by the same rule the streaming adapters use for their first token.

const start = useFakeOllama();

afterEach(() => {
  vi.restoreAllMocks();
});

function chatTimeouts(spy: {
  readonly mock: { readonly calls: readonly (readonly unknown[])[] };
}): number[] {
  return spy.mock.calls.map((call) => Number(call[0]));
}

describe('OllamaProvider timeout against the prompt size', () => {
  it('P3-113 waits longer for a long prompt than for a short one', async () => {
    const { provider } = await start('context-trained-large', { timeoutSeconds: 120 });
    const spy = vi.spyOn(AbortSignal, 'timeout');

    await provider.complete(requestOf(1_000));
    const shortRun = chatTimeouts(spy);
    spy.mockClear();
    await provider.complete(requestOf(100_000));
    const longRun = chatTimeouts(spy);

    expect(Math.max(...shortRun)).toBe(120_000);
    expect(Math.max(...longRun)).toBe(firstTokenWaitMs(120_000, 100_000));
    expect(Math.max(...longRun)).toBeGreaterThan(Math.max(...shortRun));
  });
});
