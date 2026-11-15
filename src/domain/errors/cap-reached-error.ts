import { ERROR_CODES } from './codes.js';
import { RosettaError } from './rosetta-error.js';

// RF-422, RF-435, P9-02: the refusal of a model call that could pass a cap (RST-1600), with whether
// the cap is the journey's approved line. Only that one is answered by Analyse again (RST-2311).
export class CapReachedError extends RosettaError {
  readonly approvedLine: boolean;

  constructor(approvedLine: boolean) {
    super(ERROR_CODES.budgetCapReached);
    this.name = 'CapReachedError';
    this.approvedLine = approvedLine;
  }
}
