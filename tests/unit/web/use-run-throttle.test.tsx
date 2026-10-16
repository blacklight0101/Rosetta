import { useState } from 'preact/hooks';
import { act, screen, fireEvent } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { useRun } from '../../../web/src/pages/use-run.js';
import { renderPage } from './fake-api.js';
import { runPath, runRow, runUuid } from './live-run-helpers.js';

function Probe() {
  const [progress, setProgress] = useState(0);
  const load = useRun(runUuid, progress);
  return (
    <button
      onClick={() => {
        setProgress((value) => value + 1);
      }}
    >
      {load.status}
    </button>
  );
}
afterEach(() => {
  vi.useRealTimers();
});

it('RF-1004 500 progress events in ten seconds cause at most one run read per second and a final trailing read', async () => {
  vi.useFakeTimers();
  const view = renderPage(<Probe />, { [`GET ${runPath}`]: () => runRow() });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText('ready')).toBeTruthy();
  for (let progress = 1; progress <= 500; progress += 1) {
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await vi.advanceTimersByTimeAsync(20);
    });
  }
  expect(view.calls.length).toBeLessThanOrEqual(11);
  expect(view.calls.length).toBeGreaterThanOrEqual(10);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  const settled = view.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(view.calls).toHaveLength(settled);
});

it('RF-1004 unmount cancels a pending refresh', async () => {
  vi.useFakeTimers();
  const view = renderPage(<Probe />, { [`GET ${runPath}`]: () => runRow() });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  fireEvent.click(screen.getByRole('button'));
  view.unmount();
  await vi.advanceTimersByTimeAsync(2000);
  expect(view.calls).toHaveLength(1);
});

it('RF-1004 an event after a quiet second is read at once, and a second event in the same second is read when the second ends', async () => {
  vi.useFakeTimers();
  const view = renderPage(<Probe />, { [`GET ${runPath}`]: () => runRow() });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(view.calls).toHaveLength(1);
  await act(async () => {
    fireEvent.click(screen.getByRole('button'));
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(view.calls).toHaveLength(2);
  await act(async () => {
    fireEvent.click(screen.getByRole('button'));
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(view.calls).toHaveLength(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(view.calls).toHaveLength(3);
});
