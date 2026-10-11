import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { failedStatus } from '../../../../../src/infrastructure/providers/openai/openai-errors.js';

// RF-406: what each OpenAI error status means, whether it is retried, and the fix it names.

/** OpenAI's error code for a rejected key, built from pieces (FAKE fixture, RNF-003). */
const invalidKey = ['invalid', 'api', 'key'].join('_');

describe('OpenAI error statuses', () => {
  it.each([
    [429, 'rate_limit_exceeded', ERROR_CODES.providerRateLimited],
    [408, undefined, ERROR_CODES.providerTimeout],
    [500, undefined, ERROR_CODES.providerCallFailed],
    [502, undefined, ERROR_CODES.providerCallFailed],
    [503, undefined, ERROR_CODES.providerCallFailed],
  ])('RF-406 status %i (%s) is retried as %s', (status, errorCode, code) => {
    const failed = failedStatus({ status, errorCode }, 'gpt-test');

    expect(failed).toMatchObject({ retryable: true, failure: { code, httpStatus: status } });
  });

  it.each([
    [401, invalidKey, ERROR_CODES.openAiKeyRejected],
    [404, 'model_not_found', ERROR_CODES.openAiModelUnknown],
    [429, 'insufficient_quota', ERROR_CODES.openAiQuotaExhausted],
    [400, 'context_length_exceeded', ERROR_CODES.providerCallFailed],
    [403, 'unsupported_country_region_territory', ERROR_CODES.providerCallFailed],
    [404, undefined, ERROR_CODES.providerCallFailed],
    [409, undefined, ERROR_CODES.providerCallFailed],
    [422, undefined, ERROR_CODES.providerCallFailed],
  ])('RF-406 status %i (%s) is permanent as %s', (status, errorCode, code) => {
    const failed = failedStatus({ status, errorCode }, 'gpt-test');

    expect(failed).toMatchObject({ retryable: false, failure: { code, httpStatus: status } });
  });

  it('RF-406 keeps the request id and the retry-after hint of a failed attempt', () => {
    const failed = failedStatus(
      { status: 429, errorCode: undefined, requestId: 'req_FAKE01', retryAfterMs: 4000 },
      'gpt-test',
    );

    expect(failed).toMatchObject({
      failure: { requestId: 'req_FAKE01' },
      retryAfterMs: 4000,
    });
  });

  it.each([
    [401, invalidKey, 'OPENAI_API_KEY'],
    [404, 'model_not_found', '"gpt-test"'],
    [429, 'insufficient_quota', 'billing'],
  ])('RF-406 the message of permanent status %i (%s) names the fix', (status, errorCode, fix) => {
    const failed = failedStatus({ status, errorCode }, 'gpt-test');

    expect(failed.message).toContain(fix);
  });
});
