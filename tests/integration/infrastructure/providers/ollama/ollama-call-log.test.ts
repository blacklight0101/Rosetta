import { describe, expect, it } from 'vitest';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { observedHarness } from '../../../../support/observed-harness.js';
import { useFakeOllama } from '../../../../support/ollama-harness.js';

// RF-408: the call log record of an Ollama call holds Ollama's own timings (fake server, ADR-008).

const start = useFakeOllama();

describe('OllamaProvider in the provider call log', () => {
  it("RF-408 an Ollama call's record holds load, prompt-evaluation and generation durations and tokens per second", async () => {
    const { provider: ollama } = await start('contract-text');
    const { provider, log } = observedHarness({ inner: () => ollama });

    await provider.complete(contractRequest());

    expect(log.records()).toEqual([
      expect.objectContaining({
        status: 'ok',
        httpStatus: 200,
        modelVersion: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        inputTokens: 1200,
        outputTokens: 80,
        usageSource: 'reported',
        ollama: {
          loadDurationMs: 500,
          promptEvalDurationMs: 600,
          evalDurationMs: 1000,
          tokensPerSecond: 80,
        },
      }),
    ]);
  });

  it('RF-408 each retried Ollama attempt is its own record with the same call id', async () => {
    const { provider: ollama } = await start('cold-load-oom');
    const { provider, log } = observedHarness({ inner: () => ollama });

    await provider.complete(contractRequest());

    expect(log.records()).toEqual([
      expect.objectContaining({ attempt: 1, status: 'retried', httpStatus: 500 }),
      expect.objectContaining({ attempt: 2, status: 'ok' }),
    ]);
  });
});
