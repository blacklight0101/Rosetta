import { describe, expect, it } from 'vitest';
import { contractRequest } from '../../../contracts/llm-provider.contract.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import {
  factoryHarness,
  serverKeyText,
  settingsFor,
} from '../../../support/provider-factory-harness.js';

// RF-429, RF-422, P8-132: the reader of a run carries the worst case of its calls, as the budget
// guard reserves it, so the readers' room can count the calls in flight with the same figures.

const openAi = settingsFor({ reader: { provider: 'openai', model: 'contract-model' } });

describe('P8-132 the reader the factory builds', () => {
  it('RF-429 knows the worst case of a call: its prompt estimate plus its output limit, priced', async () => {
    const harness = factoryHarness({ serverKeys: { openai: serverKeyText } });
    const built = await harness.factory.build(
      harness.request({ roles: ['reader'], settings: openAi, cloudConsent: true }),
    );
    const request = contractRequest();

    const worst = built.ok ? built.value.get('reader')?.worstCaseOf?.(request) : undefined;

    const tokens = BigInt(estimateInputTokens(request) + (request.maxOutputTokens ?? 0));
    expect(worst?.tokens).toBe(tokens);
    // contract-model: 1 micro-dollar per input token and 2 per output token.
    const output = BigInt(request.maxOutputTokens ?? 0);
    expect(worst?.micros).toBe(tokens - output + 2n * output);
  });
});
