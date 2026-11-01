import { screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { renderLive, runPath, runRow } from './live-run-helpers.js';

// RF-1108, EV-80: the live page of a queued run shows its place and the runs ahead, and reads the
// run again while it waits, because a queued run has no events to move the page.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('RF-1108 EV-80 the status of a queued run says its place and how many runs are ahead', async () => {
  renderLive({ [`GET ${runPath}`]: runRow({ queueState: 'Queued', position: 3 }) });

  const status = await screen.findByTestId('run-status');

  expect(status.textContent).toContain('position 3, 2 runs ahead');
});

it('RF-1108 EV-80 the place moves up while the run waits', async () => {
  const places = [3, 2];
  renderLive({
    [`GET ${runPath}`]: () => runRow({ queueState: 'Queued', position: places.shift() ?? 2 }),
  });
  expect((await screen.findByTestId('run-status')).textContent).toContain('position 3');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

  await vi.advanceTimersByTimeAsync(16_000);

  await waitFor(() => {
    expect(screen.getByTestId('run-status').textContent).toContain('position 2, 1 run ahead');
  });
});
