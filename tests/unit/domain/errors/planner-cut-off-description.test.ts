import { expect, it } from 'vitest';
import { describeError } from '../../../../src/domain/errors/descriptions.js';

// RF-604, RF-007: RST-1805 is what a plan run ends with when the planner's answer is cut off at
// the output limit even after the continuations; the text names the setting that fixes it.

it('RF-007 RST-1805 names the cut-off and the setting that raises the limit', () => {
  const { message, nextStep } = describeError('RST-1805');

  expect(message).toMatch(/cut off/);
  expect(message).toMatch(/output limit|output tokens/);
  expect(nextStep).toMatch(/Planner max output tokens/);
  expect(nextStep).toMatch(/Project settings/);
});
