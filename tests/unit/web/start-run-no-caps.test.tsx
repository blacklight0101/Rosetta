import { fireEvent, screen } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { json } from './fake-api.js';
import {
  cloudEstimate,
  estimatePath,
  localEstimate,
  projectPath,
  projectWithCap,
  runAnswer,
  runsPath,
} from './start-run-fixtures.js';
import {
  consentLabel,
  input,
  opened,
  priced,
  ready,
  renderStart,
  start,
} from './start-run-helpers.js';

// RF-1022, RF-436, DEC-204: the page where Analyse is pressed holds no stage choice and no per-run
// caps, models or parallelism; they are removed, and the project settings hold them.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-1022 the page has no stage choice', async () => {
  renderStart();
  await ready();

  expect(screen.queryByRole('radio')).toBeNull();
  expect(screen.queryByRole('group', { name: 'Stage' })).toBeNull();
  expect(screen.queryByText(/Verify \(not available yet\)/u)).toBeNull();
});

it('RF-1022 a priced estimate shows no run cap field and no threshold field', async () => {
  renderStart(priced);
  await ready();

  expect(screen.queryByLabelText('Run cap (USD)')).toBeNull();
  expect(screen.queryByLabelText('Ask before a run estimated above (USD)')).toBeNull();
});

it('RF-1022 a local estimate shows no token cap field', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, localEstimate) });
  await ready();

  expect(screen.queryByLabelText('Run cap (tokens)')).toBeNull();
});

it('RF-436 the page points to the project settings for the caps', async () => {
  renderStart(priced);
  await ready();

  const link = screen.getByRole('link', { name: 'Change the caps in the project settings' });
  expect(link.getAttribute('href')).toBe('/projects/p-1/settings#caps');
});

it('RF-436 Analyse sends no stage choice, no caps and saves no settings', async () => {
  const { calls } = renderStart({ ...priced, [`POST ${runsPath}`]: runAnswer('understand', null) });
  await ready();

  fireEvent.click(input(consentLabel));
  fireEvent.click(start());

  await opened();
  const writes = calls.filter((call) => call.method !== 'GET');
  expect(writes.map((call) => call.method)).toEqual(['POST']);
  expect(JSON.stringify(writes[0]?.body)).not.toMatch(/maxCostMicros|maxTokens|parallelism/u);
});

it('RF-436 the meter shows the likely cost against the cap saved in the project settings', async () => {
  renderStart({
    [`GET ${projectPath}`]: json(200, projectWithCap(2_000_000)),
    [`GET ${estimatePath}`]: json(200, cloudEstimate),
  });
  await ready();

  // On server keys the meter is against the administrator's $0.50 run cap, lower than the $2.00 saved.
  expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('78');
  expect(screen.queryByLabelText('Run cap (USD)')).toBeNull();
});
