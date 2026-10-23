import type { TextMasker } from '../guards/secret-masker.js';
import type { AttemptFailed } from './retrying-call.js';

// RF-408, RF-140..RF-149, RNF-003: the provider's own error text as the call record and the run
// log keep it: the error type and message, masked, then cut to 500 characters with a marker. A
// network error keeps only its name, because its message can quote the request (a header, a key).

/** The longest error text a record or a log entry keeps, marker included. */
export const maxErrorTextLength = 500;

const cutMarker = ' ... [cut]';

/** The most of a provider's message that is read before masking, so a huge body costs little. */
const maxRawLength = 8_000;

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** `type: message`, either part alone when the other is missing, or undefined when both are. */
export function providerErrorText(type: unknown, message: unknown): string | undefined {
  const parts = [textOf(type), textOf(message)].filter((part) => part !== '');
  return parts.length === 0 ? undefined : parts.join(': ').slice(0, maxRawLength);
}

/** The error name of a failure with no answer from the provider (a reset, a refused connection). */
export function networkErrorText(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  // An SDK error class often keeps the name `Error`; its class name tells more.
  const name = error.name === 'Error' ? error.constructor.name : error.name;
  return name === '' ? undefined : name;
}

/**
 * The text masked, then cut: the mask runs first so a secret on the cut is never left half shown.
 * A masker failure drops the text, so the failed call is still recorded (fail closed, RNF-003).
 */
export function boundedErrorText(text: string, masker: TextMasker): string | undefined {
  let masked: string;
  try {
    masked = masker.mask(text).text;
  } catch {
    return undefined;
  }
  if (masked.length <= maxErrorTextLength) return masked;
  return `${masked.slice(0, maxErrorTextLength - cutMarker.length)}${cutMarker}`;
}

/** The failure with the provider's error text attached; unchanged when there is none. */
export function withProviderError(failed: AttemptFailed, text: string | undefined): AttemptFailed {
  if (text === undefined) return failed;
  return { ...failed, failure: { ...failed.failure, providerError: text } };
}
