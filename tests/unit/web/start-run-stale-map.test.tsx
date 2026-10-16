import { fireEvent, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { json } from './fake-api.js';
import { estimatePath, localEstimate } from './start-run-fixtures.js';
import { input, ready, renderStart, start } from './start-run-helpers.js';

const outdated = (scannerVersion: number | null) =>
  json(200, {
    ...localEstimate,
    codeMap: { scannerVersion, currentScannerVersion: 1, outdated: true },
  });

it.each([0, null])(
  'RF-113 warns about a code map of scanner version %s and offers a new scan first',
  async (scannerVersion) => {
    renderStart({ [`GET ${estimatePath}`]: outdated(scannerVersion) });
    expect(await screen.findByText('The code map is out of date.')).toBeTruthy();
    expect(screen.getByText(/third-party code/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Scan again' }));
    expect(input('Scan only').checked).toBe(true);
    expect(start().disabled).toBe(false);
  },
);

it('RF-113 the old code map can still be used: the stage stays Understand and Start stays enabled', async () => {
  renderStart({ [`GET ${estimatePath}`]: outdated(0) });
  await ready();
  expect(input('Understand').checked).toBe(true);
  expect(start().disabled).toBe(false);
});

it('RF-113 a code map of the current scanner shows no warning', async () => {
  renderStart();
  await ready();
  expect(screen.queryByText('The code map is out of date.')).toBeNull();
});

it('RF-113 an estimate that does not say anything about the code map shows no warning', async () => {
  const withoutCodeMap = Object.fromEntries(
    Object.entries(localEstimate).filter(([key]) => key !== 'codeMap'),
  );
  renderStart({ [`GET ${estimatePath}`]: json(200, withoutCodeMap) });
  await ready();
  expect(screen.queryByText('The code map is out of date.')).toBeNull();
});
