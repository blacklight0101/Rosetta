import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { RosettaError } from '../../src/domain/errors/rosetta-error.js';
import type { MaskResult, TextMasker } from '../../src/infrastructure/guards/secret-masker.js';

/** A masker that always fails, to prove that callers fail closed (RF-141, DEC-57). */
export class FailingMasker implements TextMasker {
  calls = 0;

  mask(): MaskResult {
    this.calls += 1;
    throw new RosettaError(ERROR_CODES.secretMaskingFailed);
  }
}
