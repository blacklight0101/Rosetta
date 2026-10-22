import { describe, expect, it } from 'vitest';
import type {
  LlmAttemptFailure,
  LlmAttemptObserver,
} from '../../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../../support/failure-of.js';
import { useFakeOllama } from '../../../../support/ollama-harness.js';

// RF-406: the Ollama adapter retries rate limits, timeouts and server errors with exponential
// back-off, honouring retry-after, and fails permanent errors at once (fake server, ADR-008).

const start = useFakeOllama();

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

describe('OllamaProvider retries', () => {
  it('RF-406 retries a cold load that failed with an out-of-memory server error', async () => {
    const { provider, waits } = await start('cold-load-oom');
    const attempts = new Attempts();

    const response = await provider.complete(contractRequest(), attempts);

    expect(response.text).toBe('The Catalog area lists products from the database.');
    expect(attempts.retried).toEqual([{ code: ERROR_CODES.providerCallFailed, httpStatus: 500 }]);
    expect(waits).toHaveLength(1);
  });

  it('RF-406 retries an attempt that timed out', async () => {
    const { provider } = await start('timeout-then-text', { timeoutSeconds: 0.2 });
    const attempts = new Attempts();

    const response = await provider.complete(contractRequest(), attempts);

    expect(response.finishReason).toBe('stop');
    // Q-60: a timed-out attempt is metered as estimated, with its output unknown.
    expect(attempts.retried).toMatchObject([
      {
        code: ERROR_CODES.providerTimeout,
        usage: { usageSource: 'estimated', outputUnknown: true },
      },
    ]);
  });

  it('RF-406 honours a retry-after hint', async () => {
    const { provider, waits } = await start('retry-after');

    await provider.complete(contractRequest());

    expect(waits).toEqual([7000]);
  });
});

describe('OllamaProvider retry limits', () => {
  it('RF-406 waits longer before each retry (exponential back-off)', async () => {
    const { provider, waits } = await start('server-errors-exhausted');

    await failureOf(provider.complete(contractRequest()));

    expect(waits).toEqual([750, 1500, 3000]);
  });

  it('RF-406 stops after the configured attempts with the last failure', async () => {
    const { provider, server } = await start('server-errors-exhausted', { maxRetries: 2 });
    const attempts = new Attempts();

    const error = await failureOf(provider.complete(contractRequest(), attempts));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed, httpStatus: 503 });
    expect(attempts.started).toBe(3);
    expect(server.chatBodies()).toHaveLength(3);
  });

  it('RF-406 does not retry a permanent error', async () => {
    const { provider, server } = await start('bad-request');
    const attempts = new Attempts();

    const error = await failureOf(provider.complete(contractRequest(), attempts));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed, httpStatus: 400 });
    expect(attempts.retried).toEqual([]);
    expect(server.chatBodies()).toHaveLength(1);
  });

  it('RF-406 a call cancelled during the back-off wait stops with RST-1501', async () => {
    const controller = new AbortController();
    const { provider } = await start('cold-load-oom');
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
