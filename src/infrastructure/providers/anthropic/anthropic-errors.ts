import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk';
import { ERROR_CODES, type ErrorCode } from '../../../domain/errors/codes.js';
import { networkErrorText, providerErrorText, withProviderError } from '../error-text.js';
import { retryHintMs } from '../retry-backoff.js';
import type { AttemptFailed } from '../retrying-call.js';

// RF-404, RF-406: what each Anthropic failure means, whether it is retried, and the fix it names.
// Rate limits (429), timeouts (408 and our own), server errors and overloads (5xx, 529) and a
// failed connection are retried; a rejected key (401), an unknown model (404) and an account
// without credit (402) stop the call at once. Anthropic's own error text is never copied into the
// error: it may quote part of the key (RNF-003).

interface FailedStatus {
  readonly status: number;
  readonly requestId?: string | undefined;
  readonly retryAfterMs?: number | undefined;
  /** RF-408: the error type and message Anthropic sent, kept in the call record and the log. */
  readonly text?: string | undefined;
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
  switch (response.status) {
    case 401:
      return failed(
        ERROR_CODES.anthropicKeyRejected,
        response,
        false,
        'Anthropic rejected the API key. Check the key in your account settings, or ANTHROPIC_API_KEY on the server.',
      );
    case 402:
      return failed(
        ERROR_CODES.anthropicCreditExhausted,
        response,
        false,
        'The Anthropic account has no credit left. Add credit in the Anthropic Console billing settings.',
      );
    case 404:
      return failed(
        ERROR_CODES.anthropicModelUnknown,
        response,
        false,
        `The model "${model}" does not exist at Anthropic or this key cannot use it. Choose another model in the project settings.`,
      );
    default:
      return undefined;
  }
}

function failedStatus(response: FailedStatus, model: string): AttemptFailed {
  return withProviderError(classified(response, model), response.text);
}

function classified(response: FailedStatus, model: string): AttemptFailed {
  const { status } = response;
  const stop = permanent(response, model);
  if (stop !== undefined) return stop;
  if (status === 429) return failed(ERROR_CODES.providerRateLimited, response, true);
  if (status === 408) return failed(ERROR_CODES.providerTimeout, response, true);
  return failed(ERROR_CODES.providerCallFailed, response, status >= 500);
}

/** RF-408: the type and message of the error in the body Anthropic answered with. */
function bodyText(error: object): string | undefined {
  const body: unknown = Reflect.get(error, 'error');
  if (typeof body !== 'object' || body === null) return undefined;
  const inner: unknown = Reflect.get(body, 'error');
  const detail = typeof inner === 'object' && inner !== null ? inner : body;
  return providerErrorText(Reflect.get(detail, 'type'), Reflect.get(detail, 'message'));
}

/** The HTTP side of an SDK status error, read field by field (the SDK types them loosely). */
function statusOf(error: object): FailedStatus | undefined {
  const status: unknown = Reflect.get(error, 'status');
  if (typeof status !== 'number') return undefined;
  const headers: unknown = Reflect.get(error, 'headers');
  const known = headers instanceof Headers ? headers : new Headers();
  return {
    status,
    text: bodyText(error),
    requestId: known.get('request-id') ?? undefined,
    retryAfterMs: retryHintMs(known),
  };
}

/**
 * The error to keep as the cause: only the SDK's own API and transport errors, which hold the
 * status and the network failure but no key. Anything else (for example the TypeError of a bad
 * header, whose message quotes the whole key) is dropped (RNF-003).
 */
function safeCause(error: unknown): unknown {
  return error instanceof APIConnectionError ? error : undefined;
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
  if (context.timedOut || error instanceof APIConnectionTimeoutError) {
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
  return withProviderError(
    {
      failure: { code: ERROR_CODES.providerCallFailed },
      retryable: true,
      cause: safeCause(error),
    },
    networkErrorText(error),
  );
}
