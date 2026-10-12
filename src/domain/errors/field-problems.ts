import type { ErrorCode } from './codes.js';
import { RosettaError } from './rosetta-error.js';

// RF-002, RF-010, RF-007: a refusal that points at fields. Each problem names its field, its own
// code and, where the catalogue message is too general, a plain reason. The HTTP layer lists them
// next to the code of the refusal, so a form can show each one beside its field.

export interface FieldProblem {
  /** Dotted path of the field, for example `budget.run.maxCostMicros`; `url` for the address. */
  readonly field: string;
  readonly code: ErrorCode;
  /** A plain sentence for this field, when the code's message is not specific enough. */
  readonly reason?: string;
}

export class FieldProblemsError extends RosettaError {
  readonly problems: readonly FieldProblem[];

  constructor(code: ErrorCode, problems: readonly FieldProblem[]) {
    super(code);
    this.name = 'FieldProblemsError';
    this.problems = problems;
  }
}
