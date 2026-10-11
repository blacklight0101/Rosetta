import { describe, expect, it } from 'vitest';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { observedHarness } from '../../../../support/observed-harness.js';
import { useFakeOpenAi } from '../../../../support/openai-harness.js';
import { fakeOpenAiKey } from '../../../../support/secret-fixture.js';

// RF-408: the call log records of an OpenAI call hold the request id, the dated model id and the
// cached input tokens, one record per attempt, and never the key (fake server, ADR-008).

const start = useFakeOpenAi();

describe('OpenAiProvider in the provider call log', () => {
  it("RF-408 an OpenAI call's record holds the request id, model version and cached tokens", async () => {
    const { provider: openAi } = await start('contract-text');
    const { provider, log } = observedHarness({ inner: () => openAi });

    await provider.complete(contractRequest());

    expect(log.records()).toEqual([
      expect.objectContaining({
        status: 'ok',
        httpStatus: 200,
        requestId: 'req_FAKE0000000000000000000001',
        modelVersion: 'contract-model-2026-08-07',
        inputTokens: 1200,
        outputTokens: 80,
        cachedInputTokens: 1024,
        usageSource: 'reported',
      }),
    ]);
  });

  it('RF-408 each retried OpenAI attempt is its own record with the same call id', async () => {
    const { provider: openAi } = await start('server-error-then-text');
    const { provider, log } = observedHarness({ inner: () => openAi });

    await provider.complete(contractRequest());

    const records = log.records();
    expect(records).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: 'retried',
        httpStatus: 500,
        requestId: 'req_FAKE0000000000000000000500',
      }),
      expect.objectContaining({ attempt: 2, status: 'ok' }),
    ]);
    expect(new Set(records.map((record) => record.callId)).size).toBe(1);
  });

  it('RF-408 a failed OpenAI call leaves no key in the call log', async () => {
    const { provider: openAi } = await start('contract-permanent-failure');
    const { provider, log } = observedHarness({ inner: () => openAi });

    await provider.complete(contractRequest()).catch(() => undefined);

    expect(JSON.stringify(log.records())).not.toContain(fakeOpenAiKey);
    expect(log.records()).toEqual([
      expect.objectContaining({ status: 'failed', errorCode: 'RST-1511', httpStatus: 401 }),
    ]);
  });
});
