import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { PlanNext } from '../../../web/src/pages/PlanNext.js';

// RF-614: the plan action of the Your turn panel offers nothing before the run's end is known.

it('RF-614 offers nothing while the end of the run is not known', () => {
  render(
    <PlanNext
      {...{ runId: 'r-1', projectId: 'p-1', endState: '', supportedClaims: 3 }}
      questionsOpen={false}
      onResumed={() => undefined}
    />,
  );

  expect(screen.queryByRole('button')).toBeNull();
});
