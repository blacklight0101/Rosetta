import { describe, expect, it } from 'vitest';
import type {
  LlmAttemptFailure,
  LlmAttemptObserver,
} from '../../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { AnthropicProvider } from '../../../../../src/infrastructure/providers/anthropic/anthropic-provider.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { useFakeAnthropic } from '../../../../support/anthropic-harness.js';
import { closedLoopbackUrl } from '../../../../support/fake-http-server.js';
import { failureOf } from '../../../../support/failure-of.js';
import { fakeAnthropicKey } from '../../../../support/secret-fixture.js';

// RF-404, RF-406: the Anthropic adapter retries rate limits, overloads, timeouts and server errors
// with exponential back-off and jitter, honouring retry-after, and stops permanent errors (bad
// key, unknown model, no credit) at once with a coded error that names the fix (ADR-008).

const start = useFakeAnthropic();

class Attempts implements LlmAttemptObserver {
  started = 0;
  readonly retried: LlmAttemptFailure[] = [];

  attemptStarted(): void {
    this.started += 1;
  }

  attemptRetried(failure: LlmAttemptFailure): Promise<void> {
    this.retried.push(failure);
    return Promise.resolve();
  }
}

/** Everything an error shows: message, own fields and its cause chain. */
function everythingIn(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined; depth += 1) {
    if (current instanceof Error) parts.push(current.message, current.stack ?? '');
    parts.push(JSON.stringify(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join('\n');
}

describe('AnthropicProvider retries temporary failures', () => {
  it('RF-406 retries a rate limit and reports the attempt to the observer', async () => {
    const { provider, waits } = await start('contract-retry-then-text');
    const attempts = new Attempts();

    const response = await provider.complete(contractRequest(), attempts);

    expect(response.finishReason).toBe('stop');
    expect(attempts.retried).toEqual([{ code: ERROR_CODES.providerRateLimited, httpStatus: 429 }]);
    expect(waits).toEqual([750]);
  });

  it('RF-406 retries an overloaded API (529) and keeps its request id for the call log', async () => {
    const { provider } = await start('overloaded-then-text');
    const attempts = new Attempts();

    await provider.complete(contractRequest(), attempts);

    expect(attempts.retried).toEqual([
      {
        code: ERROR_CODES.providerCallFailed,
        httpStatus: 529,
        requestId: 'req_FAKE00000000000000000529',
      },
    ]);
  });

  it('RF-406 retries an attempt that timed out', async () => {
    const { provider } = await start('timeout-then-text', { timeoutSeconds: 0.2 });
    const attempts = new Attempts();

    const response = await provider.complete(contractRequest(), attempts);

    expect(response.finishReason).toBe('stop');
    expect(attempts.retried).toEqual([{ code: ERROR_CODES.providerTimeout }]);
  });
});

describe('AnthropicProvider retry hints and connections', () => {
  it('RF-406 honours a retry-after hint in seconds', async () => {
    const { provider, waits } = await start('retry-after');

    await provider.complete(contractRequest());

    expect(waits).toEqual([7000]);
  });

  it('RF-406 retries a connection that failed', async () => {
    const provider = new AnthropicProvider({
      apiKey: fakeAnthropicKey,
      baseUrl: await closedLoopbackUrl(),
      timeoutSeconds: 5,
      maxRetries: 1,
      testMode: true,
      fakeServer: true,
      sleep: () => Promise.resolve(),
    });
    const attempts = new Attempts();

    const error = await failureOf(provider.complete(contractRequest(), attempts));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed });
    expect(attempts.started).toBe(2);
  });
});

describe('AnthropicProvider retry limits', () => {
  it('RF-406 waits longer before each retry (exponential back-off with jitter)', async () => {
    const { provider, waits } = await start('server-errors-exhausted');

    await failureOf(provider.complete(contractRequest()));

    expect(waits).toEqual([750, 1500, 3000]);
  });

  it('RF-406 stops after the configured attempts with the last failure', async () => {
    const { provider, server } = await start('server-errors-exhausted', { maxRetries: 3 });
    const attempts = new Attempts();

    const error = await failureOf(provider.complete(contractRequest(), attempts));

    expect(error).toMatchObject({
      code: ERROR_CODES.providerCallFailed,
      httpStatus: 503,
      requestId: 'req_FAKE00000000000000000503',
    });
    expect(attempts.started).toBe(4);
    expect(server.messageBodies()).toHaveLength(4);
  });

  it('RF-406 a call cancelled during the back-off wait stops with RST-1501', async () => {
    const controller = new AbortController();
    const { provider } = await start('overloaded-then-text');
    const observer: LlmAttemptObserver = {
      attemptStarted: () => undefined,
      attemptRetried: () => {
        controller.abort();
        return Promise.resolve();
      },
    };

    const error = await failureOf(provider.complete(contractRequest(controller.signal), observer));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallCancelled });
  });
});

describe('AnthropicProvider permanent failures', () => {
  it('RF-406 a rejected key stops at once with RST-1518 and names the fix', async () => {
    const { provider, server } = await start('contract-permanent-failure');
    const attempts = new Attempts();

    const error = await failureOf(provider.complete(contractRequest(), attempts));

    expect(error).toMatchObject({
      code: ERROR_CODES.anthropicKeyRejected,
      httpStatus: 401,
      requestId: 'req_FAKE00000000000000000401',
    });
    expect(error instanceof Error ? error.message : '').toContain('ANTHROPIC_API_KEY');
    expect(attempts.retried).toEqual([]);
    expect(server.messageBodies()).toHaveLength(1);
  });

  it('RNF-003 a rejected key leaves the key and the provider text out of the error', async () => {
    const { provider } = await start('contract-permanent-failure');

    const error = await failureOf(provider.complete(contractRequest()));

    const shown = everythingIn(error);
    expect(shown).not.toContain(fakeAnthropicKey);
    expect(shown).not.toContain(fakeAnthropicKey.slice(-8));
    expect(shown).not.toContain('invalid x-api-key');
  });
});

describe('AnthropicProvider other permanent failures', () => {
  it('RF-406 an unknown model stops at once with RST-1519 naming the model', async () => {
    const { provider, server } = await start('model-unknown');

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.anthropicModelUnknown, httpStatus: 404 });
    expect(error instanceof Error ? error.message : '').toContain('"contract-model"');
    expect(server.messageBodies()).toHaveLength(1);
  });

  it('RF-406 an account without credit stops at once with RST-1520', async () => {
    const { provider, server } = await start('credit-exhausted');

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.anthropicCreditExhausted, httpStatus: 402 });
    expect(server.messageBodies()).toHaveLength(1);
  });

  it('RF-406 does not retry a bad request', async () => {
    const { provider, server } = await start('bad-request');
    const attempts = new Attempts();

    const error = await failureOf(provider.complete(contractRequest(), attempts));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed, httpStatus: 400 });
    expect(attempts.retried).toEqual([]);
    expect(server.messageBodies()).toHaveLength(1);
  });
});
