import { screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { unsavedBrief } from './plan-setup-fixtures.js';
import { base, press, ready, renderPlan, stepName } from './plan-setup-helpers.js';

// RF-605, Q-59, DEC-80: while no stack layer is answered, the defaults button says that the package
// names no technology; the line goes once one layer is answered.

const NO_STACK_LINE = /the package will name no technology/u;

const oneLayer = {
  ...unsavedBrief,
  brief: {
    ...unsavedBrief.brief,
    stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
  },
};

describe('plan setup stack line', () => {
  it('RF-605 says beside the defaults button that no technology is named while no layer is answered', async () => {
    renderPlan();
    await ready();

    expect(screen.getByText(NO_STACK_LINE)).not.toBeNull();
    press('Choose a stack');
    expect(stepName()).toBe('Stack');
  });

  it('RF-605 drops that line once one stack layer is answered', async () => {
    renderPlan({ [`GET ${base}/planning-brief`]: json(200, oneLayer) });
    await ready();

    expect(screen.queryByText(NO_STACK_LINE)).toBeNull();
  });
});
