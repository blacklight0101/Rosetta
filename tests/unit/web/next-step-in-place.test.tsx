import { screen, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { JourneyStrip } from '../../../web/src/pages/JourneyStrip.js';
import { json, renderPage } from './fake-api.js';
import { facts, projectId, roadSigns } from './journey-fixtures.js';
import { base } from './plan-setup-helpers.js';
import {
  catalogue,
  planEstimate,
  planOptions,
  planSource,
  unsavedBrief,
} from './plan-setup-fixtures.js';
import { renderStart } from './start-run-helpers.js';

// RF-1021, DEC-204: on the project page "Answer questions", "Set up the plan" and "Start the plan"
// work in place: the strip holds the Questions and plan setup section, so the user never visits
// another page between the steps.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const region = (): HTMLElement =>
  screen.getByRole('region', { name: 'Journey from code to package' });

it.each(['asking', 'noBrief', 'estimate'] as const)(
  'RF-1021 on the %s road the strip holds the setup in place and no button that leaves the page',
  (road) => {
    renderPage(
      <JourneyStrip
        view={journeyOf(roadSigns[road] ?? facts(), projectId)}
        onResumed={() => undefined}
        setup={<p data-testid="setup">Setup here</p>}
      />,
      {},
    );

    expect(within(region()).getByTestId('setup')).toBeTruthy();
    expect(
      within(region()).queryByRole('button', { name: /^(Answer|Set up|Start the plan)/u }),
    ).toBeNull();
    expect(within(region()).queryByRole('button', { name: 'Go on with the defaults' })).toBeNull();
    expect(within(region()).queryByRole('link', { name: 'Go on with the defaults' })).toBeNull();
  },
);

it('RF-1021 a written package opens the package, with no setup in the way', () => {
  renderPage(
    <JourneyStrip
      view={journeyOf(roadSigns['written'] ?? facts(), projectId)}
      onResumed={() => undefined}
      setup={<p data-testid="setup">Setup here</p>}
    />,
    {},
  );

  expect(within(region()).queryByTestId('setup')).toBeNull();
  expect(within(region()).getByRole('button', { name: 'Open the package' })).toBeTruthy();
});

it('RF-1021 the project page shows the questions and the plan setup in place and stays on the page', async () => {
  window.history.pushState({}, '', `/projects/${projectId}/start`);
  renderStart({
    [`GET /api/projects/${projectId}/journey`]: json(200, roadSigns['asking']),
    'GET /api/plan/catalogue': json(200, catalogue),
    [`GET ${base}/planning-brief`]: json(200, unsavedBrief),
    [`POST ${base}/plan-options`]: json(200, planOptions),
    [`GET ${base}/plan-estimate`]: json(200, planEstimate),
    [`GET ${base}/plan-source`]: json(200, planSource),
    'GET /api/runs/run-1/answers': json(200, { questions: [] }),
  });

  await screen.findByRole('region', { name: 'Questions and plan setup' });

  expect(window.location.pathname).toBe(`/projects/${projectId}/start`);
  expect(within(region()).queryByRole('button', { name: /^Answer / })).toBeNull();
});
