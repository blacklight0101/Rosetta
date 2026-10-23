import { expect, it } from 'vitest';
import { describeError } from '../../../../src/domain/errors/descriptions.js';

// P3-130, RF-007: RST-1523 is the next free providers code; it is what a run ends with when a role
// that calls tools is given a model the shipped list marks as unable to call tools.

it('RF-007 RST-1523 says the model cannot call tools and names the remedy', () => {
  const { message, nextStep } = describeError('RST-1523');

  expect(message).toMatch(/tools/);
  expect(nextStep).toMatch(/reader/);
});
