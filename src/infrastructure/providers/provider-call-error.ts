import type { LlmAttemptFailure, TokenUsage } from '../../application/ports/llm-provider.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

export interface ProviderCallErrorOptions extends ErrorOptions {
  /** A message naming the fix (RF-401), instead of the catalogue's plain one. */
  readonly message?: string | undefined;
  /** The call was refused before anything was sent to the provider (DEC-155). */
  readonly notSent?: boolean | undefined;
  /** The usage the provider reported for a call that was made but whose answer was dropped. */
  readonly usage?: TokenUsage | undefined;
}

// RF-406, RF-408: a provider call that failed for good, with what the call log needs to know
// about its last attempt.
export class ProviderCallError extends RosettaError {
  readonly httpStatus: number | undefined;
  readonly requestId: string | undefined;
  /**
   * RF-408: the provider's error text. The adapter sets it raw; the observing decorator replaces
   * it with the masked, cut text before the error leaves it, so everything above sees that one.
   */
  declare providerError: string | undefined;
  /** True when nothing was sent: the budget guard frees the reservation, no ledger row (RF-428). */
  readonly notSent: boolean;
  /** The reported usage of a call whose answer was dropped, for the ledger (RF-428). */
  readonly usage: TokenUsage | undefined;

  constructor(failure: LlmAttemptFailure, options?: ProviderCallErrorOptions) {
    const { message, notSent, usage, ...errorOptions } = options ?? {};
    super(failure.code, message, errorOptions);
    this.name = 'ProviderCallError';
    this.httpStatus = failure.httpStatus;
    this.requestId = failure.requestId;
    // Not enumerable: a serialised error never carries the provider's raw text (RNF-003).
    Object.defineProperty(this, 'providerError', {
      value: failure.providerError,
      writable: true,
      enumerable: false,
    });
    this.notSent = notSent ?? false;
    this.usage = usage;
  }
}
