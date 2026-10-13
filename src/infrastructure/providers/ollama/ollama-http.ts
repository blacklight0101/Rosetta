import { ERROR_CODES } from '../../../domain/errors/codes.js';
import {
  cappedResponse,
  defaultMaxResponseBytes,
  ResponseTooLargeError,
} from '../capped-response.js';
import type { AttemptFailed } from '../retrying-call.js';
import { failedStatus, failedThrown } from './ollama-errors.js';
import { errorText } from './ollama-wire.js';

// RF-401, conventions section 5, ADR-013: one HTTP exchange with Ollama, with a timeout, the
// caller's abort signal and a cap on the answer's size. A redirect is an error, never followed, so
// an answer cannot send the call to another address. A failure is classified, never thrown, so the
// provider decides about retries.

export interface OllamaExchange {
  readonly url: URL;
  readonly body?: unknown;
  readonly model: string;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
  /** The largest answer read; 8 MiB when not set. */
  readonly maxBodyBytes?: number;
}

export type ExchangeResult =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly failed: AttemptFailed };

function tooLarge(error: ResponseTooLargeError): ExchangeResult {
  const failure = { code: ERROR_CODES.providerCallFailed };
  const message = `Ollama sent an answer larger than ${String(error.maxBytes)} bytes, so it was not read.`;
  return { ok: false, failed: { failure, retryable: false, message } };
}

async function jsonOf(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function exchange(request: OllamaExchange): Promise<ExchangeResult> {
  const timeout = AbortSignal.timeout(request.timeoutMs);
  const signal = AbortSignal.any([request.signal, timeout]);
  try {
    const response = await fetch(request.url, {
      method: request.body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      redirect: 'error',
      signal,
    });
    const body = await jsonOf(
      cappedResponse(response, request.maxBodyBytes ?? defaultMaxResponseBytes),
    );
    if (response.ok) return { ok: true, body };
    const status = { status: response.status, error: errorText(body) };
    const retryAfter = response.headers.get('retry-after');
    return { ok: false, failed: failedStatus({ ...status, retryAfter }, request.model) };
  } catch (error) {
    if (error instanceof ResponseTooLargeError) return tooLarge(error);
    const context = {
      cancelled: request.signal.aborted,
      timedOut: timeout.aborted,
      host: request.url.host,
    };
    return { ok: false, failed: failedThrown(error, context) };
  }
}
