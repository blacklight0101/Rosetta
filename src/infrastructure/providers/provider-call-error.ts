import type { LlmAttemptFailure } from '../../application/ports/llm-provider.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

export interface ProviderCallErrorOptions extends ErrorOptions {
  /** A message naming the fix (RF-401), instead of the catalogue's plain one. */
  readonly message?: string | undefined;
}

// RF-406, RF-408: a provider call that failed for good, with what the call log needs to know
// about its last attempt.
export class ProviderCallError extends RosettaError {
  readonly httpStatus: number | undefined;
  readonly requestId: string | undefined;

  constructor(failure: LlmAttemptFailure, options?: ProviderCallErrorOptions) {
    const { message, ...errorOptions } = options ?? {};
    super(failure.code, message, errorOptions);
    this.name = 'ProviderCallError';
    this.httpStatus = failure.httpStatus;
    this.requestId = failure.requestId;
  }
}
