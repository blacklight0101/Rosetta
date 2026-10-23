import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { OpenAiProvider } from '../../../../../src/infrastructure/providers/openai/openai-provider.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../../support/failure-of.js';
import { fakeOpenAiKey } from '../../../../support/secret-fixture.js';

// P3-129, RF-406: the 400 body OpenAI returned for function tools with a reasoning effort
// (evaluation 2026-10-23) is a request error: reported as a failed call, never retried.

const recorded400 = {
  error: {
    message:
      "Function tools with reasoning_effort are not supported for gpt-6-luna in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",
    type: 'invalid_request_error',
    param: null,
    code: null,
  },
};

describe('OpenAI rejecting tools with a reasoning effort', () => {
  it('RF-406 reports the recorded 400 as a request error and does not retry it', async () => {
    let calls = 0;
    const provider = new OpenAiProvider({
      apiKey: fakeOpenAiKey,
      baseUrl: 'http://127.0.0.1:9/v1',
      timeoutSeconds: 5,
      maxRetries: 3,
      testMode: false,
      sleep: () => Promise.resolve(),
      random: () => 0.5,
      fetch: () => {
        calls += 1;
        return Promise.resolve(
          new Response(JSON.stringify(recorded400), {
            status: 400,
            headers: { 'content-type': 'application/json', 'x-request-id': 'req_FAKE0000400' },
          }),
        );
      },
    });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(calls).toBe(1);
    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed });
  });
});
