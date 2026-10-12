import { describe, expect, it } from 'vitest';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { useFakeAnthropic } from '../../../../support/anthropic-harness.js';
import { observedHarness } from '../../../../support/observed-harness.js';
import { fakeAnthropicKey } from '../../../../support/secret-fixture.js';

// RF-404, RF-408: the call log record of an Anthropic call holds the request id, the model
// version and the cached input tokens, one record per attempt, and never the key (ADR-008).

const start = useFakeAnthropic();

describe('AnthropicProvider in the provider call log', () => {
  it("RF-404 an Anthropic call's record holds the request id, model version and cached tokens", async () => {
    const { provider: anthropic } = await start('contract-text');
    const { provider, log } = observedHarness({ inner: () => anthropic });

    await provider.complete(contractRequest());

    expect(log.records()).toEqual([
      expect.objectContaining({
        status: 'ok',
        httpStatus: 200,
        requestId: 'req_FAKE00000000000000000001',
        modelVersion: 'contract-model-20260807',
        inputTokens: 1200,
        outputTokens: 80,
        cachedInputTokens: 1024,
        usageSource: 'reported',
      }),
    ]);
  });

  it('RF-408 a failed Anthropic call leaves no key in the call log', async () => {
    const { provider: anthropic } = await start('contract-permanent-failure');
    const { provider, log } = observedHarness({ inner: () => anthropic });

    await provider.complete(contractRequest()).catch(() => undefined);

    expect(JSON.stringify(log.records())).not.toContain(fakeAnthropicKey);
    expect(log.records()).toEqual([
      expect.objectContaining({ status: 'failed', errorCode: 'RST-1518', httpStatus: 401 }),
    ]);
  });
});
