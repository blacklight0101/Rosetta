import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { PlanNext } from '../../../web/src/pages/PlanNext.js';

// RF-614: the plan action of the Your turn panel offers nothing before the run's end is known.

it('RF-614 offers nothing while the end of the run is not known', () => {
  render(
    <PlanNext
      {...{ runId: 'r-1', projectId: 'p-1', endState: '', supportedClaims: 3 }}
      questionsOpen={false}
    />,
  );

  expect(screen.queryByRole('button')).toBeNull();
});

// RF-614, P7-26: a run that ended on its cap says what was left and does not send the user to Resume.
it('P7-26 names what a capped run left and offers the overview, not the Resume button', () => {
  render(
    <PlanNext
      {...{ runId: 'r-1', projectId: 'p-1', endState: 'CapReached', supportedClaims: 0 }}
      questionsOpen={false}
      left={{ unreadAreas: 3, unjudgedClaims: 12, overviewMissing: true }}
      writeOverview={<button type="button">Write the overview</button>}
    />,
  );

  const text = document.body.textContent;
  expect(text).toContain('3 areas not read');
  expect(text).toContain('12 claims not judged');
  expect(text).toContain('the overview');
  expect(text).toContain('Deepen');
  expect(text).not.toContain('Resume run button');
  expect(text).not.toContain('appears once it completes');
  expect(screen.getByRole('button', { name: 'Write the overview' })).toBeTruthy();
});
