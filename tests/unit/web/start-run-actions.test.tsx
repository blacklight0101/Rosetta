import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import {
  changedElsewhere,
  project,
  projectPath,
  projectWithCap,
  runAnswer,
  runsPath,
} from './start-run-fixtures.js';
import { describedText, input, ready, renderStart, start } from './start-run-helpers.js';

// RF-1001, RF-1108, RF-1105, DEC-108: pressing Start on the start page: the request each stage
// sends, the cap saved with the settings, the refusals next to their fields, the URL that is
// resolved first, the queued run with Cancel. The API is the fake of fake-api.tsx.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-1001 starts a scan with the stage only', async () => {
  const { calls } = renderStart({ [`POST ${runsPath}`]: runAnswer('scan', null) });
  await ready();

  fireEvent.click(input('Scan only'));
  expect(screen.queryByLabelText('Catalog')).toBeNull();
  fireEvent.click(start());

  const notice = await screen.findByTestId('run-notice');
  expect(notice.textContent).toContain('Run started');
  expect(calls.at(-1)).toEqual({
    method: 'POST',
    path: runsPath,
    csrf: 'csrf-0',
    body: { stage: 'scan' },
  });
});

it('RF-1001 starts an understand run with the chosen areas and no consent when nothing is cloud', async () => {
  const { calls } = renderStart({ [`POST ${runsPath}`]: runAnswer('understand', null) });
  await ready();

  fireEvent.click(start());

  await screen.findByTestId('run-notice');
  expect(calls.at(-1)?.body).toEqual({
    stage: 'understand',
    areas: ['Catalog', 'Models'],
    cloudConsent: false,
  });
});

it('RF-1001 a refusal of the run shows its code next to Start', async () => {
  renderStart({ [`POST ${runsPath}`]: failure(400, 'RST-2302') });
  await ready();

  fireEvent.click(start());

  const banner = await screen.findByTestId('error-banner');
  expect(banner.textContent).toContain('RST-2302');
  expect(screen.queryByTestId('run-notice')).toBeNull();
});

it('RF-1001 a changed run cap is saved with the settings before the run starts', async () => {
  const { calls } = renderStart({
    [`PUT ${projectPath}/settings`]: json(200, projectWithCap(1_500_000)),
    [`POST ${runsPath}`]: runAnswer('scan', null),
  });
  await ready();

  fireEvent.input(input('Run cap (USD)'), { target: { value: '1.50' } });
  fireEvent.click(start());

  await screen.findByTestId('run-notice');
  const writes = calls.filter((call) => call.method !== 'GET');
  expect(writes.map((call) => `${call.method} ${call.path}`)).toEqual([
    `PUT ${projectPath}/settings`,
    `POST ${runsPath}`,
  ]);
  expect(writes[0]?.body).toMatchObject({ budget: { run: { maxCostMicros: 1_500_000 } } });
});

it('RF-1001 a run cap the server refuses shows next to the cap field and starts nothing', async () => {
  const { calls } = renderStart({
    [`PUT ${projectPath}/settings`]: failure(400, 'RST-1003', [
      { field: 'budget.run.maxCostMicros', code: 'RST-1003' },
    ]),
  });
  await ready();

  fireEvent.input(input('Run cap (USD)'), { target: { value: '9' } });
  fireEvent.click(start());

  await waitFor(() => {
    expect(input('Run cap (USD)').getAttribute('aria-invalid')).toBe('true');
  });
  expect(describedText(input('Run cap (USD)'))).toContain('RST-1003');
  expect(calls.some((call) => call.path === runsPath)).toBe(false);
});

it('RF-1001 a run cap that is not an amount is refused next to the field without a request', async () => {
  const { calls } = renderStart();
  await ready();

  fireEvent.input(input('Run cap (USD)'), { target: { value: 'lots' } });
  fireEvent.click(start());

  await waitFor(() => {
    expect(input('Run cap (USD)').getAttribute('aria-invalid')).toBe('true');
  });
  expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
});

it('RF-1001 an invalid URL shows its code and reason next to the field and starts nothing', async () => {
  const { calls } = renderStart({
    'POST /api/projects': json(400, {
      code: 'RST-1900',
      message: 'The address is not a public GitHub repository URL.',
      nextStep: 'Use https://github.com/<owner>/<repo>.',
      problems: [
        {
          field: 'url',
          code: 'RST-1900',
          message: 'The address is not a public GitHub repository URL.',
          nextStep: 'Use https://github.com/<owner>/<repo>.',
          reason: 'The address is not on github.com.',
        },
      ],
    }),
  });
  await ready();

  fireEvent.input(input('GitHub repository URL'), {
    target: { value: 'https://example.com/octo/demo' },
  });
  fireEvent.click(start());

  await waitFor(() => {
    expect(document.activeElement).toBe(input('GitHub repository URL'));
  });
  const message = describedText(input('GitHub repository URL'));
  expect(message).toContain('RST-1900');
  expect(message).toContain('The address is not on github.com.');
  expect(calls.some((call) => call.path === runsPath)).toBe(false);
  expect(window.location.pathname).toBe('/');
});

it('RF-1001 Resolve opens the start page of the project for another URL', async () => {
  renderStart({
    'POST /api/projects': json(201, { ...project, id: 'p-2', name: 'acme/shop' }),
  });
  await ready();

  fireEvent.input(input('GitHub repository URL'), {
    target: { value: 'https://github.com/acme/shop' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

  await waitFor(() => {
    expect(window.location.pathname).toBe('/projects/p-2/start');
  });
});

it('RF-1108 a queued run shows its position and can be cancelled', async () => {
  const { calls } = renderStart({
    [`POST ${runsPath}`]: runAnswer('understand', 2, '20261012-100000-understand'),
    'POST /api/runs/r-1/stop': json(200, {
      ...{ runId: '20261012-100000-understand', stage: 'understand', queueState: 'Ended' },
      stopRequested: false,
    }),
  });
  await ready();

  fireEvent.click(start());

  const notice = await screen.findByTestId('run-notice');
  expect(notice.textContent).toContain('Queued');
  expect(notice.textContent).toContain('position 2');
  expect(screen.queryByRole('button', { name: /^Start run/u })).toBeNull();
  fireEvent.click(within(notice).getByRole('button', { name: 'Cancel queued run' }));

  await waitFor(() => {
    expect(screen.getByTestId('run-notice').textContent).toContain('cancelled');
  });
  expect(calls.at(-1)).toMatchObject({
    method: 'POST',
    path: '/api/runs/r-1/stop',
    csrf: 'csrf-0',
  });
  expect(start().disabled).toBe(false);
});

it('RF-1108 a cancel the server refuses shows its code in the notice', async () => {
  renderStart({
    [`POST ${runsPath}`]: runAnswer('understand', 1, 'k-1'),
    'POST /api/runs/r-1/stop': failure(409, 'RST-2303'),
  });
  await ready();
  fireEvent.click(start());
  const notice = await screen.findByTestId('run-notice');

  fireEvent.click(within(notice).getByRole('button', { name: 'Cancel queued run' }));

  await waitFor(() => {
    expect(screen.getByTestId('run-notice').textContent).toContain('RST-2303');
  });
});

it("RF-1105 another user's project shows the not-found error and no form", async () => {
  renderStart({ [`GET ${projectPath}`]: failure(404, 'RST-2003') });

  expect((await screen.findByRole('alert')).textContent).toContain('RST-2003');
  expect(screen.queryByRole('button', { name: /^Start run/u })).toBeNull();
});

it('RF-1108 Cancel names the run by its id, not by its folder name', async () => {
  const { calls } = renderStart({
    [`POST ${runsPath}`]: runAnswer('scan', 1, '20261012-100000-scan'),
    'POST /api/runs/r-1/stop': json(200, { runId: '20261012-100000-scan' }),
  });
  await ready();
  fireEvent.click(start());
  const notice = await screen.findByTestId('run-notice');

  fireEvent.click(within(notice).getByRole('button', { name: 'Cancel queued run' }));

  await waitFor(() => {
    expect(screen.getByTestId('run-notice').textContent).toContain('cancelled');
  });
  expect(calls.some((call) => call.path.includes('20261012-100000-scan'))).toBe(false);
});

it('RF-1001 saving the run cap keeps what changed in the settings since the page opened', async () => {
  let reads = 0;
  const { calls } = renderStart({
    [`GET ${projectPath}`]: () => json(200, reads++ === 0 ? project : changedElsewhere()),
    [`PUT ${projectPath}/settings`]: json(200, projectWithCap(1_500_000)),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();

  fireEvent.input(input('Run cap (USD)'), { target: { value: '1.50' } });
  fireEvent.click(start());

  await screen.findByTestId('run-notice');
  const saved = calls.find((call) => call.method === 'PUT');
  expect(saved?.body).toMatchObject({
    budget: { run: { maxCostMicros: 1_500_000 } },
    scan: { areaTokenBudget: 12_345 },
    roles: { reader: { model: 'changed-elsewhere' } },
  });
});
