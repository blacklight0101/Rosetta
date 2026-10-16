import { ERROR_CODES, type ErrorCode } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { ResponseTooLargeError } from '../capped-response.js';
import type { AttemptFailed } from '../retrying-call.js';
import { failedThrown, type ThrownContext } from './openai-errors.js';

// RF-403, RF-406, RF-1104, RNF-003: what each failure of an OpenAI-compatible call means. The HTTP
// statuses map as for OpenAI (openai-errors.ts), with messages that name the compatible service
// and the key row in the account settings instead of OpenAI and OPENAI_API_KEY. Two failures come
// from the adapter's own transport, wrapped by the SDK as a connection error: an address the
// public-address agent refused (RST-2304) and an answer past the size limit (RST-1506); neither
// is retried. The service's own text is never copied into an error: it may quote the key.

function causesOf(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined; depth += 1) {
    chain.push(current);
    current = current instanceof Error ? current.cause : undefined;
  }
  return chain;
}

function isRefusedAddress(error: unknown): error is RosettaError {
  return error instanceof RosettaError && error.code === ERROR_CODES.baseUrlRejected;
}

function transportFailure(error: unknown): AttemptFailed | undefined {
  const chain = causesOf(error);
  const refused = chain.find(isRefusedAddress);
  if (refused !== undefined) {
    // The agent's message names the host and the address rule only, never the key.
    const failure = { code: ERROR_CODES.baseUrlRejected };
    return { failure, retryable: false, message: refused.message, cause: refused };
  }
  const tooLarge = chain.find((entry) => entry instanceof ResponseTooLargeError);
  if (tooLarge instanceof ResponseTooLargeError) {
    const failure = { code: ERROR_CODES.providerCallFailed };
    return { failure, retryable: false, message: tooLarge.message };
  }
  return undefined;
}

/** The messages that name the compatible service instead of OpenAI and OPENAI_API_KEY. */
const serviceMessages: Partial<Record<ErrorCode, (model: string) => string>> = {
  [ERROR_CODES.openAiKeyRejected]: () =>
    'The OpenAI-compatible service rejected the API key. Check the key and its base URL in your account settings.',
  [ERROR_CODES.openAiModelUnknown]: (model) =>
    `The model "${model}" does not exist at the OpenAI-compatible service or this key cannot use it. Choose another model in the project settings.`,
  [ERROR_CODES.openAiQuotaExhausted]: () =>
    'The account at the OpenAI-compatible service has no credit left. Add credit in that service.',
};

/** A failure the SDK threw, classified for the shared retry loop. */
// RF-403, RF-1104
export function compatibleFailure(
  error: unknown,
  context: ThrownContext,
  model: string,
): AttemptFailed {
  const fromTransport = context.cancelled ? undefined : transportFailure(error);
  if (fromTransport !== undefined) return fromTransport;
  const failed = failedThrown(error, context, model);
  const message = serviceMessages[failed.failure.code]?.(model);
  return message === undefined ? failed : { ...failed, message };
}
