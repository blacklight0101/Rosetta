import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import {
  cloudEstimate,
  estimatePath,
  localEstimate,
  noCodeMap,
  ownKeyEstimate,
  projectPath,
  projectWithCap,
  runAnswer,
  runsPath,
  unpricedEstimate,
} from './start-run-fixtures.js';
import {
  consentLabel,
  describedText,
  input,
  ready,
  renderStart,
  start,
} from './start-run-helpers.js';

// RF-1001, RF-143, RF-425, DEC-108, design-system.md section 14 (Start run): what the start page
// shows of a project: the stages and areas, the estimate with unknown costs, the cloud notice with
// its consent and the cap warnings. The API is the fake of fake-api.tsx with the shapes of the
// real routes (run-routes.ts, estimate-view.ts).

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-1001 shows the repository, the stages, the areas and the estimate of an understand run', async () => {
  renderStart();

  await ready();

  expect(screen.getByRole('heading', { name: 'Start a run', level: 1 })).not.toBeNull();
  expect(input('GitHub repository URL').value).toBe('https://github.com/octo/demo');
  expect(screen.getByText('src/legacy')).not.toBeNull();
  expect(input('Understand').checked).toBe(true);
  expect(input('Catalog').checked).toBe(true);
  expect(input('Models').checked).toBe(true);
  expect(start().disabled).toBe(false);
  expect(screen.queryByText(/Code will leave this machine/u)).toBeNull();
});

it('RF-425 shows tokens and cost per role as low, likely and high with the assumptions', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, cloudEstimate) });

  await ready();

  const reader = screen.getByRole('row', { name: /reader/u });
  expect(within(reader).getByText('openai / gpt-5-nano')).not.toBeNull();
  expect(within(reader).getByText('$0.12')).not.toBeNull();
  expect(within(reader).getByText('$0.39')).not.toBeNull();
  expect(within(reader).getByText('$0.80')).not.toBeNull();
  expect(within(reader).getByText('22,000 tokens')).not.toBeNull();
  const total = screen.getByRole('row', { name: /Total/u });
  expect(within(total).getByText('$0.39')).not.toBeNull();
  expect(screen.getByText(/2 areas/u).textContent).toContain('price table 2026-10-11');
});

it('RF-425 a model without a price shows its cost as unknown and the total as incomplete', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, unpricedEstimate) });

  await ready();

  const verifier = screen.getByRole('row', { name: /verifier/u });
  expect(within(verifier).getAllByText('unknown')).toHaveLength(3);
  expect(within(verifier).queryByText('$0.00')).toBeNull();
  expect(screen.getByText(/The total is not complete/u).textContent).toContain('anthropic');
  expect(
    within(screen.getByRole('row', { name: /Total/u })).getAllByText(/at least/u),
  ).toHaveLength(3);
});

it('RF-425 Re-estimate asks for the estimate again', async () => {
  const { calls } = renderStart();
  await ready();

  fireEvent.click(screen.getByRole('button', { name: 'Re-estimate' }));

  await waitFor(() => {
    expect(calls.filter((call) => call.path === estimatePath)).toHaveLength(2);
  });
});

it('RF-425 choosing fewer areas estimates only those areas', async () => {
  const { calls } = renderStart({
    [`POST ${estimatePath}`]: json(200, localEstimate),
  });
  await ready();

  fireEvent.click(input('Models'));

  await waitFor(() => {
    expect(
      calls.some(
        (call) =>
          call.method === 'POST' &&
          call.path === estimatePath &&
          JSON.stringify(call.body) === JSON.stringify({ areas: ['Catalog'] }),
      ),
    ).toBe(true);
  });
});

it('RF-1001 with no area chosen Start is disabled and says why', async () => {
  renderStart();
  await ready();

  fireEvent.click(input('Models'));
  fireEvent.click(input('Catalog'));

  expect(start().disabled).toBe(true);
  expect(start().title).toBe('Choose at least one area.');
});

it('RF-1001 without a scan the understand stage is off, the scan is chosen and the reason is shown', async () => {
  renderStart({ [`GET ${estimatePath}`]: noCodeMap });

  await screen.findByText(/Run a scan first/u);

  expect(input('Understand').disabled).toBe(true);
  expect(input('Scan only').checked).toBe(true);
  expect(start().disabled).toBe(false);
  expect(screen.queryByRole('table', { name: 'Estimate per role' })).toBeNull();
});

it('RF-1001 with no code map the page shows the scan note and no run cap or threshold field', async () => {
  renderStart({ [`GET ${estimatePath}`]: noCodeMap });

  await screen.findByText(/A scan reads the repository/u);

  expect(screen.queryByLabelText('Run cap (USD)')).toBeNull();
  expect(screen.queryByLabelText('Ask before a run estimated above (USD)')).toBeNull();
});

it('RF-143 names the cloud provider and keeps Start off until the consent is given', async () => {
  const { calls } = renderStart({
    [`GET ${estimatePath}`]: json(200, cloudEstimate),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();

  const notice = screen.getByText(/Code will leave this machine/u).closest('section');
  expect(notice?.textContent).toContain('OpenAI');
  expect(notice?.textContent).toContain('reader');
  expect(start().disabled).toBe(true);
  expect(start().title).toBe('Confirm the OpenAI notice above to start the run');
  expect(start().textContent).toBe('Start run (confirm the OpenAI notice)');

  fireEvent.click(input(consentLabel));
  expect(start().disabled).toBe(false);
  fireEvent.click(start());

  await screen.findByTestId('run-notice');
  expect(calls.at(-1)?.body).toEqual({
    stage: 'understand',
    areas: ['Catalog', 'Models'],
    cloudConsent: true,
  });
});

it('RF-143 a scan needs no consent even when the roles use a cloud provider', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, cloudEstimate) });
  await ready();

  fireEvent.click(input('Scan only'));

  expect(screen.queryByText(/Code will leave this machine/u)).toBeNull();
  expect(start().disabled).toBe(false);
});

it('RF-143 a refusal for the missing consent shows the notice with the code next to its checkbox', async () => {
  renderStart({
    [`GET ${estimatePath}`]: json(200, localEstimate),
    [`POST ${runsPath}`]: failure(400, 'RST-1515'),
  });
  await ready();

  fireEvent.click(start());

  await waitFor(() => {
    expect(describedText(input(/^I understand/u))).toContain('RST-1515');
  });
});

it('RF-1001 a likely estimate above the run cap warns, names the cap and keeps Start available', async () => {
  renderStart({
    [`GET ${projectPath}`]: json(200, projectWithCap(250_000)),
    [`GET ${estimatePath}`]: json(200, cloudEstimate),
  });
  await ready();

  const warning = screen.getByTestId('cap-warning');
  expect(warning.textContent).toContain('run cap');
  expect(warning.textContent).toContain('$0.25');
  expect(warning.textContent).toContain('$0.14');
  expect(input('Run cap (USD)').value).toBe('0.25');
  fireEvent.click(input(consentLabel));
  expect(start().disabled).toBe(false);
});

it('RF-1001 the warning follows the cap field and the meter shows the likely cost against it', async () => {
  renderStart({
    [`GET ${projectPath}`]: json(200, projectWithCap(2_000_000)),
    [`GET ${estimatePath}`]: json(200, cloudEstimate),
  });
  await ready();

  expect(screen.queryByTestId('cap-warning')).toBeNull();
  expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('20');
  fireEvent.input(input('Run cap (USD)'), { target: { value: '0.30' } });

  expect(screen.getByTestId('cap-warning').textContent).toContain('$0.09');
  expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('100');
});

it('RF-1001 a likely cost above the daily cap on the own keys warns and names that cap', async () => {
  renderStart({
    [`GET ${estimatePath}`]: json(200, ownKeyEstimate),
    'GET /api/account/daily-cap': json(200, { ownDailyCapMicros: '300000' }),
  });
  await ready();

  await waitFor(() => {
    expect(screen.getByTestId('cap-warning').textContent).toContain('daily cap');
  });
  expect(screen.getByTestId('cap-warning').textContent).toContain('$0.09');
});

it('RF-425 an estimate that cannot be read shows its error and Start stays off for understand', async () => {
  renderStart({ [`GET ${estimatePath}`]: failure(500, 'RST-2006') });

  expect((await screen.findByTestId('error-banner')).textContent).toContain('RST-2006');
  expect(start().disabled).toBe(true);
});

it('DEC-117 a typed cap above 100 USD does not replace the cap the warning compares with', async () => {
  renderStart({
    [`GET ${projectPath}`]: json(200, projectWithCap(10_000)),
    [`GET ${estimatePath}`]: json(200, cloudEstimate),
  });
  await ready();

  fireEvent.input(input('Run cap (USD)'), { target: { value: '150' } });

  expect(screen.getByTestId('cap-warning').textContent).toContain('$0.01');
});
