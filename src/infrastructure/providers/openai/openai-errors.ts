import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from 'openai';
import { ERROR_CODES, type ErrorCode } from '../../../domain/errors/codes.js';
import { retryHintMs } from '../retry-backoff.js';
import type { AttemptFailed } from '../retrying-call.js';

// RF-402, RF-406: what each OpenAI failure means, whether it is retried, and the fix it names.
// Rate limits (429), timeouts (408 and our own), server errors (5xx) and a failed connection are
// retried; a rejected key, an unknown model and an account without credit stop the call at once.
// OpenAI's own error text is never copied into the error: it may quote part of the key (RNF-003).

export interface FailedStatus {
  readonly status: number;
  /** OpenAI's `error.code`, for example `model_not_found` or `insufficient_quota`. */
  readonly errorCode: string | null | undefined;
  readonly requestId?: string | undefined;
  readonly retryAfterMs?: number | undefined;
}

export interface ThrownContext {
  /** The caller's signal aborted. */
  readonly cancelled: boolean;
  /** The adapter's own per-attempt timeout fired. */
  readonly timedOut: boolean;
}

function failed(
  code: ErrorCode,
  response: FailedStatus,
  retryable: boolean,
  message?: string,
): AttemptFailed {
  const failure = {
    code,
    httpStatus: response.status,
    ...(response.requestId === undefined ? {} : { requestId: response.requestId }),
  };
  return {
    failure,
    retryable,
    retryAfterMs: response.retryAfterMs,
    ...(message === undefined ? {} : { message }),
  };
}

function permanent(response: FailedStatus, model: string): AttemptFailed | undefined {
  const { status, errorCode } = response;
  if (status === 401) {
    const message =
      'OpenAI rejected the API key. Check the key in your account settings, or OPENAI_API_KEY on the server.';
    return failed(ERROR_CODES.openAiKeyRejected, response, false, message);
  }
  if (status === 404 && errorCode === 'model_not_found') {
    const message = `The model "${model}" does not exist at OpenAI or this key cannot use it. Choose another model in the project settings.`;
    return failed(ERROR_CODES.openAiModelUnknown, response, false, message);
  }
  if (status === 429 && errorCode === 'insufficient_quota') {
    const message =
      'The OpenAI account has no credit left. Add credit in the OpenAI billing settings.';
    return failed(ERROR_CODES.openAiQuotaExhausted, response, false, message);
  }
  return undefined;
}

export function failedStatus(response: FailedStatus, model: string): AttemptFailed {
  const { status } = response;
  const stop = permanent(response, model);
  if (stop !== undefined) return stop;
  if (status === 429) return failed(ERROR_CODES.providerRateLimited, response, true);
  if (status === 408) return failed(ERROR_CODES.providerTimeout, response, true);
  return failed(ERROR_CODES.providerCallFailed, response, status >= 500);
}

/** The HTTP side of an SDK status error, read field by field (the SDK types them loosely). */
function statusOf(error: object): FailedStatus | undefined {
  const status: unknown = Reflect.get(error, 'status');
  if (typeof status !== 'number') return undefined;
  const code: unknown = Reflect.get(error, 'code');
  const headers: unknown = Reflect.get(error, 'headers');
  const known = headers instanceof Headers ? headers : new Headers();
  return {
    status,
    errorCode: typeof code === 'string' ? code : undefined,
    requestId: known.get('x-request-id') ?? undefined,
    retryAfterMs: retryHintMs(known),
  };
}

/**
 * The error to keep as the cause: only the SDK's own API and transport errors, which hold the
 * status and the network failure but no key. Anything else (for example the TypeError of a bad
 * header, whose message quotes the whole key) is dropped (RNF-003).
 */
function safeCause(error: unknown): unknown {
  return error instanceof APIError || error instanceof APIConnectionError ? error : undefined;
}

/** A failure the SDK threw: an error status, a timeout, a cancel or a failed connection. */
export function failedThrown(error: unknown, context: ThrownContext, model: string): AttemptFailed {
  if (context.cancelled) {
    return {
      failure: { code: ERROR_CODES.providerCallCancelled },
      retryable: false,
      cause: safeCause(error),
    };
  }
  const timedOut = context.timedOut || error instanceof APIConnectionTimeoutError;
  if (timedOut) {
    return {
      failure: { code: ERROR_CODES.providerTimeout },
      retryable: true,
      cause: safeCause(error),
    };
  }
  const response =
    error instanceof APIError && !(error instanceof APIUserAbortError)
      ? statusOf(error)
      : undefined;
  if (response !== undefined) return failedStatus(response, model);
  // A failed connection: the SDK error holds no key, only the transport failure.
  return {
    failure: { code: ERROR_CODES.providerCallFailed },
    retryable: true,
    cause: safeCause(error),
  };
}
