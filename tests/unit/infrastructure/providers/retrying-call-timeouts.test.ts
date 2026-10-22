import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  completeWithRetries,
  type AttemptResult,
} from '../../../../src/infrastructure/providers/retrying-call.js';
import { failureOf, nextStepOf } from '../../../support/failure-of.js';
import { textAnswer } from '../../../support/observed-harness.js';

// RF-406, RF-208, Q-60: a call that timed out twice is not sent a third time; the other transient
// failures keep their retries.

const timeout: AttemptResult = {
  ok: false,
  failed: { failure: { code: ERROR_CODES.providerTimeout }, retryable: true },
};
const rateLimited: AttemptResult = {
  ok: false,
  failed: { failure: { code: ERROR_CODES.providerRateLimited, httpStatus: 429 }, retryable: true },
};
const answered: AttemptResult = { ok: true, response: textAnswer };

function scripted(results: readonly AttemptResult[]) {
  let sent = 0;
  const attempt = (): Promise<AttemptResult> => {
    const result = results[sent];
    sent += 1;
    return Promise.resolve(result ?? answered);
  };
  const call = () => ({
    attempt,
    signal: new AbortController().signal,
    policy: { maxRetries: 5, sleep: () => Promise.resolve(), random: () => 0.5 },
  });
  return { call, sent: () => sent };
}

describe('retrying a timed-out call', () => {
  it('Q-60 stops after the second timeout, with RST-1505 and a next step naming the setting', async () => {
    const { call, sent } = scripted([timeout, timeout, answered]);

    const error = await failureOf(completeWithRetries(call()));

    expect(sent()).toBe(2);
    expect(error).toMatchObject({ code: ERROR_CODES.providerTimeout });
    expect(nextStepOf(error)).toContain('timeoutSeconds');
  });

  it('Q-60 counts the timeouts of a call, whatever failed between them', async () => {
    const { call, sent } = scripted([timeout, rateLimited, timeout, answered]);

    await failureOf(completeWithRetries(call()));

    expect(sent()).toBe(3);
  });

  it('RF-208 retries a single timeout and the other transient failures as before', async () => {
    const { call, sent } = scripted([timeout, rateLimited, rateLimited, rateLimited, answered]);

    const response = await completeWithRetries(call());

    expect(response.text).toBe(textAnswer.text);
    expect(sent()).toBe(5);
  });
});
