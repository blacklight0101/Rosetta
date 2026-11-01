import { describe, expect, it } from 'vitest';
import { writeOverview } from '../../../../src/application/overview/write-overview.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { overviewCards } from '../../../support/app-overview-fixtures.js';
import { Answers, partsOf, standing } from '../../../support/overview-step-harness.js';

// RF-264, P7-26: an overview call a cap refused says so and names the way to write it.

describe('writeOverview when a cap refuses the call', () => {
  it('RF-264 says the cap stopped it and points to "Write the overview"', async () => {
    const provider = new Answers(() => {
      throw new RosettaError(ERROR_CODES.budgetCapReached);
    });
    const { parts } = partsOf(provider);

    const overview = await writeOverview(parts, {
      cards: overviewCards(),
      areas: [standing('Orders'), standing('Billing')],
    });

    expect(overview.state).toBe('unavailable');
    expect(overview.notice).toContain('cap');
    expect(overview.notice).toContain('Write the overview');
  });
});
