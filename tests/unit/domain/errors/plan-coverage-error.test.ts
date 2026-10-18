import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';

// RF-627, RF-007, RF-008: a plan run whose package leaves an item without a task card is not
// complete; its code says what is missing and where to read it.

describe('RST-1805 the plan leaves an item without a task card', () => {
  it('RF-627 is in the plan range, after the hand-off write failure', () => {
    expect(ERROR_CODES.planCoverageGap).toBe('RST-1805');
  });

  it('RF-008 says the package was written, what is missing and the next step', () => {
    const { message, nextStep } = describeError(ERROR_CODES.planCoverageGap);

    expect(message).toMatch(/package was written/iu);
    expect(message).toMatch(/task card/iu);
    expect(nextStep).toContain('checks.md');
  });
});
