import type { CardOutputs, CardSet } from '../../src/application/ports/card-outputs.js';
import type { RunScope } from '../../src/application/ports/run-events.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { RosettaError } from '../../src/domain/errors/rosetta-error.js';

// RNF-002: a card writer that refuses its writes while `failing()` says so, and otherwise writes
// through the real one; the coverage and invalid-output writes always go through.

export class FailingCardOutputs implements CardOutputs {
  private readonly inner: CardOutputs;
  private readonly failing: () => boolean;

  constructor(inner: CardOutputs, failing: () => boolean) {
    this.inner = inner;
    this.failing = failing;
  }

  writeCards(scope: RunScope, set: CardSet): Promise<void> {
    if (this.failing()) {
      return Promise.reject(new RosettaError(ERROR_CODES.cardOutputInvalid, 'The write failed.'));
    }
    return this.inner.writeCards(scope, set);
  }

  writeCoverage: CardOutputs['writeCoverage'] = (scope, coverage, objects) =>
    this.inner.writeCoverage(scope, coverage, objects);

  writeInvalidOutput: CardOutputs['writeInvalidOutput'] = (scope, id, raw) =>
    this.inner.writeInvalidOutput(scope, id, raw);
}
