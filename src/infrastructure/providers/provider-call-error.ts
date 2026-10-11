import type { LlmAttemptFailure } from '../../application/ports/llm-provider.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-406, RF-408: a provider call that failed for good, with what the call log needs to know
// about its last attempt.
export class ProviderCallError extends RosettaError {
  readonly httpStatus: number | undefined;
  readonly requestId: string | undefined;

  constructor(failure: LlmAttemptFailure, options?: ErrorOptions) {
    super(failure.code, undefined, options);
    this.name = 'ProviderCallError';
    this.httpStatus = failure.httpStatus;
    this.requestId = failure.requestId;
  }
}
