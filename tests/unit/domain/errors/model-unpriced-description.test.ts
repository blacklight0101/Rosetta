import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';

// RF-427, RF-007, P2-37: RST-1601 is also what a run on the user's own Anthropic key ends with when
// the price override of its model has no cache-write price, so the text the run page shows for the
// code cannot say only that the price table lacks the model.

it('RF-427 the RST-1601 text covers an override without a cache-write price', () => {
  const { message, nextStep } = describeError(ERROR_CODES.modelUnpriced);

  expect(message).toMatch(/price table/);
  expect(message).toMatch(/override/);
  expect(message).toMatch(/cache-write/);
  expect(nextStep).toMatch(/cache-write/);
});
