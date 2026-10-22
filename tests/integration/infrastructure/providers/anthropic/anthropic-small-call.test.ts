import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { ProviderCallError } from '../../../../../src/infrastructure/providers/provider-call-error.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { useFakeAnthropic } from '../../../../support/anthropic-harness.js';
import { failureOf } from '../../../../support/failure-of.js';

// RF-404, Q-60: a call whose answer is short is not streamed, and a failure that is not a timeout
// is metered as before: no usage is made up for it.

const start = useFakeAnthropic();

describe('Anthropic: a small call', () => {
  it('Q-60 is sent without a stream, as before', async () => {
    const { provider, server } = await start('contract-text');

    await provider.complete({ ...contractRequest(), maxOutputTokens: 8_192 });

    expect(server.messageBodies()).toEqual([
      expect.objectContaining({ stream: false, max_tokens: 8_192 }),
    ]);
  });

  it('ADR-007 a failure that is not a timeout carries no usage of its own', async () => {
    const { provider } = await start('server-errors-exhausted', { maxRetries: 0 });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed, usage: undefined });
  });
});
