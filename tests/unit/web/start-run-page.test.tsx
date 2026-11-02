import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import {
  cloudEstimate,
  estimatePath,
  limitsAnswer,
  localEstimate,
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
  opened,
} from './start-run-helpers.js';

// RF-1001, RF-143, RF-425, DEC-108, design-system.md section 14 (Start run): what the start page
// shows of a project: the stages and areas, the estimate with unknown costs, the cloud notice with
// its consent and the cap warnings. The API is the fake of fake-api.tsx with the shapes of the
// real routes (run-routes.ts, estimate-view.ts).

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-1001 shows the repository, the areas and the estimate of an understand run', async () => {
  renderStart();

  await ready();

  expect(screen.getByRole('heading', { name: 'Start a run', level: 1 })).not.toBeNull();
  expect(input('GitHub repository URL').value).toBe('https://github.com/octo/demo');
  expect(screen.getByText('src/legacy')).not.toBeNull();
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
  expect(screen.getByText(/2 areas.*price table/su).textContent).toContain(
    'price table 2026-10-11',
  );
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
  expect(start().textContent).toBe('Analyse (confirm the OpenAI notice)');

  fireEvent.click(input(consentLabel));
  expect(start().disabled).toBe(false);
  fireEvent.click(start());
  // RF-425: the likely cost ($0.39) is above the project's $0.25 threshold, so the run is confirmed.
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm and start' }));

  await opened();
  expect(calls.at(-1)?.body).toEqual({
    stage: 'understand',
    areas: ['Catalog', 'Models'],
    cloudConsent: true,
  });
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
  fireEvent.click(input(consentLabel));
  expect(start().disabled).toBe(false);
});

it('RF-1001 a likely cost above the daily cap on the own keys warns and names that cap', async () => {
  renderStart({
    [`GET ${estimatePath}`]: json(200, ownKeyEstimate),
    'GET /api/account/limits': limitsAnswer({ ownDay: { cap: '300000', spent: '0' } }),
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

// P5-07: a local-only estimate names tokens in its cap meter, never a dollar sentence.
it('P5-07 a local-only estimate says its likely cost in tokens, not in dollars', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, localEstimate) });
  await ready();

  const estimate = document.querySelector<HTMLElement>('[aria-labelledby="estimate-heading"]');
  expect(estimate?.textContent).toContain('tokens');
  expect(estimate?.textContent ?? '').not.toMatch(/Likely $/u);
});
