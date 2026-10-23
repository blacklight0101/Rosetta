import { screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { json } from './fake-api.js';
import { ev, runEnded, startedData } from './live-run-fixtures.js';
import { renderLive, runPath, runRow } from './live-run-helpers.js';

// RF-615, RF-1108 (EV-13): the page of a failed plan run names no Resume. A plan run is never
// resumed; the journey says "Try the plan again", and the failure's next step must say so too.

afterEach(() => {
  vi.unstubAllGlobals();
});

it('EV-13 a failed plan run page says Try the plan again and never Resume', async () => {
  const { stream } = renderLive({
    [`GET ${runPath}`]: runRow({ stage: 'plan', queueState: 'Ended', endState: 'Failed' }),
    [`GET /api/errors/RST-1501`]: json(200, {
      code: 'RST-1501',
      message: 'The call to the AI provider was cancelled.',
      nextStep: 'The run was stopped or reached a cap; resume it when you are ready.',
    }),
  });
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', { ...startedData, stage: 'plan' }));
  connection.event(runEnded(2, 'Failed', 'RST-1501'));

  await waitFor(() => {
    expect(screen.getByTestId('run-failure').textContent).toContain('Try the plan again');
  });
  expect(screen.getByTestId('run-failure').textContent).not.toMatch(/resume/i);
});
