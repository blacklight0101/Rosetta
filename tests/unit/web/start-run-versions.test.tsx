import { fireEvent, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { projectOf } from './project-fixtures.js';
import { projectPath, projectWithCap, runAnswer, runsPath } from './start-run-fixtures.js';
import { consentLabel, input, priced, ready, renderStart, start } from './start-run-helpers.js';

// RF-002, RF-1001 (P1-106): the start page saves a changed run cap from the settings it has just
// read, naming their version, so a settings save made in another tab in between is refused instead
// of overwritten; the refusal shows above Start with its code and no run is started.

const settingsPath = `${projectPath}/settings`;

function readsWithVersions(): () => Response {
  let reads = 0;
  return () => json(200, projectOf('p-1', 'octo/demo', { settingsVersion: reads++ === 0 ? 1 : 7 }));
}

it('RF-002 saving the run cap names the version of the settings read just before the save', async () => {
  const { calls } = renderStart({
    ...priced,
    [`GET ${projectPath}`]: readsWithVersions(),
    [`PUT ${settingsPath}`]: json(200, projectWithCap(1_500_000)),
    [`POST ${runsPath}`]: runAnswer('scan', null),
  });
  await ready();

  fireEvent.input(input('Run cap (USD)'), { target: { value: '1.50' } });
  fireEvent.click(input(consentLabel));
  fireEvent.click(start());

  await screen.findByTestId('run-notice');
  expect(calls.find((call) => call.method === 'PUT')?.ifMatch).toBe('"7"');
});

it('RF-002 a cap save refused as stale shows RST-1007 above Start and starts no run', async () => {
  const { calls } = renderStart({ ...priced, [`PUT ${settingsPath}`]: failure(409, 'RST-1007') });
  await ready();

  fireEvent.input(input('Run cap (USD)'), { target: { value: '1.50' } });
  fireEvent.click(input(consentLabel));
  fireEvent.click(start());

  const banner = await screen.findByTestId('error-banner');
  expect(banner.textContent).toContain('RST-1007');
  expect(calls.some((call) => call.path === runsPath)).toBe(false);
});
