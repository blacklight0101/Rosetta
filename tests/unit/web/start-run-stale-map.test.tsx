import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { estimatePath, localEstimate, runAnswer, runsPath } from './start-run-fixtures.js';
import { input, ready, renderStart, start } from './start-run-helpers.js';

const outdated = (scannerVersion: number | null) =>
  json(200, {
    ...localEstimate,
    codeMap: { scannerVersion, currentScannerVersion: 1, outdated: true },
  });

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const confirmation = 'Use the old code map for this run';

it.each([0, null])(
  'RF-113 a code map of scanner version %s is announced, with a new scan as the first action',
  async (scannerVersion) => {
    renderStart({ [`GET ${estimatePath}`]: outdated(scannerVersion) });
    expect(await screen.findByText('The code map is out of date.')).toBeTruthy();
    expect(screen.getByText(/third-party code/u)).toBeTruthy();
    const buttons = screen.getAllByRole('button').map((button) => button.textContent);
    expect(buttons.indexOf('Scan again')).toBeGreaterThanOrEqual(0);
    expect(buttons.indexOf('Scan again')).toBeLessThan(
      buttons.findIndex((text) => text.startsWith('Analyse')),
    );
  },
);

it('RF-113 an Understand start on an outdated map is blocked until it is confirmed, then allowed', async () => {
  const { calls } = renderStart({
    [`GET ${estimatePath}`]: outdated(0),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();
  expect(start().disabled).toBe(true);
  fireEvent.click(input(confirmation));
  expect(start().disabled).toBe(false);
  fireEvent.click(input(confirmation));
  expect(start().disabled).toBe(true);
  fireEvent.click(input(confirmation));
  fireEvent.click(start());
  await waitFor(() => {
    expect(calls.some((call) => call.path === runsPath && call.method === 'POST')).toBe(true);
  });
});

it('RF-113 a code map of the current scanner is not gated', async () => {
  renderStart();
  await ready();
  expect(screen.queryByText('The code map is out of date.')).toBeNull();
  expect(start().disabled).toBe(false);
});

it('RF-113 an estimate that says nothing about the code map is not gated', async () => {
  const withoutCodeMap = Object.fromEntries(
    Object.entries(localEstimate).filter(([key]) => key !== 'codeMap'),
  );
  renderStart({ [`GET ${estimatePath}`]: json(200, withoutCodeMap) });
  await ready();
  expect(screen.queryByText('The code map is out of date.')).toBeNull();
  expect(start().disabled).toBe(false);
});

it('RF-113 Scan again starts a new scan at once and the page stays', async () => {
  const { calls } = renderStart({
    [`GET ${estimatePath}`]: outdated(0),
    [`POST ${runsPath}`]: runAnswer('scan', 1),
  });
  await ready();

  fireEvent.click(screen.getByRole('button', { name: 'Scan again' }));

  await waitFor(() => {
    expect(calls.some((call) => call.method === 'POST' && call.path === runsPath)).toBe(true);
  });
  expect(window.location.pathname).toBe('/');
});
