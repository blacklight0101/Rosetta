import { screen } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { ev, startedData } from './live-run-fixtures.js';
import { renderLive, runPath, runRow } from './live-run-helpers.js';
import { codeMapAnswer, codeMapPath, ownAreas } from './live-run-running-helpers.js';

// RF-1015 (EV-19): the page of a plan run shows the plan steps and none of the understand panels
// (the code map, the retry and the Deepen notices).

afterEach(() => {
  vi.unstubAllGlobals();
});

it('RF-1015 a running plan run shows its plan steps and no code map', async () => {
  const { stream } = renderLive({
    [`GET ${runPath}`]: runRow({ stage: 'plan' }),
    [`GET ${codeMapPath}`]: codeMapAnswer(ownAreas),
  });
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', { ...startedData, stage: 'plan' }));

  await screen.findByRole('list', { name: 'Pipeline' });
  expect(screen.queryByRole('heading', { name: 'The code, area by area' })).toBeNull();
});
