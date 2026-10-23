import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { networkErrorText, providerErrorText, withProviderError } from '../error-text.js';
import { retryAfterMs } from '../retry-backoff.js';
import type { AttemptFailed } from '../retrying-call.js';

// RF-401, RF-406: what each Ollama failure means, whether it is retried, and the fix it names.
// Rate limits, timeouts, server errors (a cold load that ran out of memory answers 500) and a
// connection dropped mid-answer are retried; everything else ends the call at once.

export interface FailedResponse {
  readonly status: number;
  /** Ollama's `error` text. */
  readonly error: string;
  readonly retryAfter: string | null;
}

export interface ThrownContext {
  readonly cancelled: boolean;
  readonly timedOut: boolean;
  /** The Ollama host and port, never a path or query. */
  readonly host: string;
}

const unreachableCodes = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH']);

/** The model is not pulled: names the pull command (RF-401). */
export function modelMissing(model: string, httpStatus?: number): AttemptFailed {
  return {
    failure: {
      code: ERROR_CODES.ollamaModelMissing,
      ...(httpStatus === undefined ? {} : { httpStatus }),
    },
    retryable: false,
    message: `The model "${model}" is not pulled in Ollama. Run: ollama pull ${model}`,
  };
}

export function failedStatus(response: FailedResponse, model: string): AttemptFailed {
  return withProviderError(
    classified(response, model),
    providerErrorText(undefined, response.error),
  );
}

function classified(response: FailedResponse, model: string): AttemptFailed {
  const { status, error } = response;
  const hint = retryAfterMs(response.retryAfter);
  if (status === 404 && error.includes('not found')) return modelMissing(model, status);
  if (status === 400 && error.includes('does not support tools')) {
    return {
      failure: { code: ERROR_CODES.ollamaToolsUnsupported, httpStatus: status },
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      failure: { code: ERROR_CODES.providerRateLimited, httpStatus: status },
      retryable: true,
      retryAfterMs: hint,
    };
  }
  return {
    failure: { code: ERROR_CODES.providerCallFailed, httpStatus: status },
    retryable: status >= 500,
    retryAfterMs: hint,
  };
}

function errorCodeOf(value: unknown): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, 'code') : undefined;
}

/** The system error codes behind a fetch failure, including each address of a host name. */
function causeCodes(error: unknown): unknown[] {
  const cause: unknown = error instanceof Error ? error.cause : undefined;
  const nested = cause instanceof AggregateError ? cause.errors : [];
  return [errorCodeOf(cause), ...nested.map(errorCodeOf)];
}

export function failedThrown(error: unknown, context: ThrownContext): AttemptFailed {
  if (context.cancelled) {
    return { failure: { code: ERROR_CODES.providerCallCancelled }, retryable: false, cause: error };
  }
  if (context.timedOut) {
    return { failure: { code: ERROR_CODES.providerTimeout }, retryable: true, cause: error };
  }
  const unreachable = causeCodes(error).some(
    (code) => typeof code === 'string' && unreachableCodes.has(code),
  );
  if (unreachable) {
    return withProviderError(
      {
        failure: { code: ERROR_CODES.ollamaUnreachable },
        retryable: false,
        message: `Ollama is not reachable at ${context.host}. Start it with: ollama serve (or open the Ollama app), and check ROSETTA_OLLAMA_URL.`,
        cause: error,
      },
      networkErrorText(error),
    );
  }
  const failed = {
    failure: { code: ERROR_CODES.providerCallFailed },
    retryable: true,
    cause: error,
  };
  return withProviderError(failed, networkErrorText(error));
}
