import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import {
  failedStatus,
  failedThrown,
  modelMissing,
} from '../../../../../src/infrastructure/providers/ollama/ollama-errors.js';

// RF-401, RF-406: which Ollama failures are retried, and the fix each one names.

const plain = { cancelled: false, timedOut: false, host: '127.0.0.1:11434' };

function refused(code: string): TypeError {
  return new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) });
}

describe('Ollama HTTP failures', () => {
  it('RF-406 a rate limit is retried with its retry-after hint', () => {
    expect(failedStatus({ status: 429, error: 'slow down', retryAfter: '3' }, 'm')).toMatchObject({
      failure: { code: ERROR_CODES.providerRateLimited, httpStatus: 429 },
      retryable: true,
      retryAfterMs: 3000,
    });
  });

  it.each([500, 502, 503])('RF-406 server error %i is retried', (status) => {
    expect(failedStatus({ status, error: 'oops', retryAfter: null }, 'm')).toMatchObject({
      failure: { code: ERROR_CODES.providerCallFailed, httpStatus: status },
      retryable: true,
    });
  });

  it('RF-401 a 404 for the model is the model-missing error with the pull command', () => {
    const failed = failedStatus(
      { status: 404, error: "model 'gemma4:e4b' not found", retryAfter: null },
      'gemma4:e4b',
    );

    expect(failed).toMatchObject({
      failure: { code: ERROR_CODES.ollamaModelMissing, httpStatus: 404 },
      retryable: false,
    });
    expect(failed.message).toContain('ollama pull gemma4:e4b');
  });

  it('RF-401 a model without tool support is a permanent error', () => {
    expect(
      failedStatus({ status: 400, error: 'tiny does not support tools', retryAfter: null }, 'm'),
    ).toMatchObject({
      failure: { code: ERROR_CODES.ollamaToolsUnsupported, httpStatus: 400 },
      retryable: false,
    });
  });

  it.each([400, 401, 403])('RF-406 client error %i is permanent', (status) => {
    expect(failedStatus({ status, error: 'no', retryAfter: null }, 'm')).toMatchObject({
      failure: { code: ERROR_CODES.providerCallFailed, httpStatus: status },
      retryable: false,
    });
  });

  it('RF-401 a missing model names the pull command', () => {
    expect(modelMissing('qwen3:8b')).toMatchObject({
      failure: { code: ERROR_CODES.ollamaModelMissing },
      retryable: false,
      message: expect.stringContaining('ollama pull qwen3:8b') as unknown,
    });
  });
});

describe('Ollama connection failures', () => {
  it('RF-401 a refused connection means Ollama is not running: permanent, with the start command', () => {
    const failed = failedThrown(refused('ECONNREFUSED'), plain);

    expect(failed).toMatchObject({
      failure: { code: ERROR_CODES.ollamaUnreachable },
      retryable: false,
    });
    expect(failed.message).toContain('ollama serve');
    expect(failed.message).toContain('127.0.0.1:11434');
  });

  it('RF-401 a refusal on every address of a host name is the same error', () => {
    const cause = new AggregateError([Object.assign(new Error('x'), { code: 'ECONNREFUSED' })]);

    expect(failedThrown(new TypeError('fetch failed', { cause }), plain)).toMatchObject({
      failure: { code: ERROR_CODES.ollamaUnreachable },
    });
  });

  it('RF-401 an unknown host is the unreachable error too', () => {
    expect(failedThrown(refused('ENOTFOUND'), plain).failure.code).toBe(
      ERROR_CODES.ollamaUnreachable,
    );
  });

  it('RF-406 a timeout is retried', () => {
    expect(failedThrown(new Error('timeout'), { ...plain, timedOut: true })).toMatchObject({
      failure: { code: ERROR_CODES.providerTimeout },
      retryable: true,
    });
  });

  it('RF-406 a cancelled call is not retried', () => {
    expect(failedThrown(new Error('abort'), { ...plain, cancelled: true })).toMatchObject({
      failure: { code: ERROR_CODES.providerCallCancelled },
      retryable: false,
    });
  });

  it('RF-406 a connection dropped mid-answer is retried', () => {
    expect(failedThrown(refused('ECONNRESET'), plain)).toMatchObject({
      failure: { code: ERROR_CODES.providerCallFailed },
      retryable: true,
    });
  });
});
