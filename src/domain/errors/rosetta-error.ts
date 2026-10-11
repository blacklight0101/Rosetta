import type { ErrorCode } from './codes.js';
import { describeError } from './descriptions.js';

// RF-007: infrastructure failures are thrown as Error subclasses with a stable code and the
// original failure as `cause` (conventions section 6).
export class RosettaError extends Error {
  readonly code: ErrorCode;
  readonly nextStep: string;

  constructor(code: ErrorCode, message?: string, options?: ErrorOptions) {
    const description = describeError(code);
    super(message ?? description.message, options);
    this.name = 'RosettaError';
    this.code = code;
    this.nextStep = description.nextStep;
  }
}
