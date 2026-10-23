import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { ScenarioOutcome } from '../../../contracts/llm-provider.contract.js';
import { loopSetup } from '../../../support/agent-loop-harness.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';

// RF-009, RF-408: the warn entry of a task whose provider call failed carries the provider's
// error text, masked by the logger, and an entry of a task that ended well carries none.

const failing = (providerError: string): ScenarioOutcome => ({
  retried: [],
  failure: { code: ERROR_CODES.providerCallFailed, httpStatus: 400, providerError },
});

describe('the run log entry of a failed provider call', () => {
  it('RF-009 carries the provider error text', async () => {
    const text = 'invalid_request_error: Function tools with reasoning_effort are not supported.';
    const { fake, request, logger } = loopSetup([failing(text)]);

    await runAgentTask(request(fake));

    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({
      level: 'warn',
      code: ERROR_CODES.providerCallFailed,
    });
    expect(logger.entries[0]?.data).toMatchObject({
      reason: 'provider-failed',
      providerError: text,
    });
  });

  it('RF-141 masks a secret-shaped value in the logged error text', async () => {
    const { fake, request, logger } = loopSetup([failing(`bad key ${fakeOpenAiKey}`)]);

    await runAgentTask(request(fake));

    expect(JSON.stringify(logger.entries)).not.toContain(fakeOpenAiKey);
    expect(JSON.stringify(logger.entries)).toContain('[MASKED:');
  });

  it('RF-009 a failure without error text logs none', async () => {
    const { fake, request, logger } = loopSetup([
      { retried: [], failure: { code: ERROR_CODES.providerCallFailed } },
    ]);

    await runAgentTask(request(fake));

    expect(logger.entries[0]?.data).not.toHaveProperty('providerError');
  });
});
