import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { JourneyPanel } from '../../../web/src/pages/JourneyPanel.js';
import { JourneyStrip } from '../../../web/src/pages/JourneyStrip.js';
import { UnderstandJourney } from '../../../web/src/pages/JourneyPlacement.js';
import { json, renderPage } from './fake-api.js';
import { facts, projectId, roadSigns, source, sourceId } from './journey-fixtures.js';
import { deepenEstimate } from './understanding-fixtures.js';
import { runPath } from './live-run-helpers.js';

// RF-1020, RF-1021, RF-209, DEC-204: the journey strip is on the project page and on every run page;
// when a step ends the strip offers the next one in place, with what is left of the approved amount;
// Deepen is a button that shows what it would read and never starts by itself; History and the
// project settings are one click away.

afterEach(() => {
  window.history.pushState({}, '', '/');
  window.localStorage.clear();
});

const region = (): HTMLElement =>
  screen.getByRole('region', { name: 'Journey from code to package' });
const budget = {
  approvedMicros: 1_000_000,
  remainingMicros: 600_000,
  approvedTokens: 2_000_000,
  remainingTokens: 1_200_000,
};
const deepenPath = `POST ${runPath}/deepen/estimate`;
const projectPath = `/api/projects/${projectId}/journey`;

it('RF-1021 says what is left of the approved amount under the next step', () => {
  const view = journeyOf(facts({ budget }), projectId);

  renderPage(<JourneyStrip view={view} onResumed={() => undefined} />, {});

  expect(region().textContent).toContain('$0.60 left of $1.00 approved');
});

it('RF-1021 says nothing about an amount when the project has no journey record', () => {
  renderPage(<JourneyStrip view={journeyOf(facts(), projectId)} onResumed={() => undefined} />, {});

  expect(region().textContent).not.toContain('approved');
});

it('RF-1021 keeps History and the project settings one click away', () => {
  renderPage(<JourneyStrip view={journeyOf(facts(), projectId)} onResumed={() => undefined} />, {});

  const history = within(region()).getByRole('link', { name: 'History' });
  const settings = within(region()).getByRole('link', { name: 'Project settings' });

  expect(history.getAttribute('href')).toBe(`/projects/${projectId}/history`);
  expect(settings.getAttribute('href')).toBe(`/projects/${projectId}/settings`);
});

it('RF-1020 the project page leaves out an action that only opens the project page itself', () => {
  const view = journeyOf(roadSigns['noRun'], projectId);

  renderPage(
    <JourneyStrip
      view={view}
      onResumed={() => undefined}
      pagePath={`/projects/${projectId}/start`}
    />,
    {},
  );

  expect(within(region()).queryByRole('button', { name: 'Start a run' })).toBeNull();
});

it('RF-1021 offers Start the plan, a button that opens Plan setup, once the brief is saved', () => {
  renderPage(<JourneyStrip view={journeyOf(facts(), projectId)} onResumed={() => undefined} />, {});

  fireEvent.click(within(region()).getByRole('button', { name: 'Start the plan' }));

  expect(window.location.pathname).toBe(`/projects/${projectId}/plan-setup`);
});

it('RF-1021 RF-209 offers Deepen in place with what it would read, and starts nothing by itself', async () => {
  const deepenable = facts({ source: source({ deepens: 0, openQuestions: 2 }), briefSaved: false });
  const page = renderPage(
    <JourneyStrip
      view={journeyOf(deepenable, projectId)}
      onResumed={() => undefined}
      deepenRunId={sourceId}
    />,
    { [deepenPath]: deepenEstimate() },
  );

  await screen.findByTestId('deepen-first-round');

  expect(within(region()).getByRole('button', { name: 'Start Deepen' })).toBeTruthy();
  expect(
    page.calls.filter((call) => call.method === 'POST' && call.path.endsWith('/deepen')),
  ).toEqual([]);
  expect(window.location.pathname).toBe('/');
});

it('RF-1020 RF-1021 a project page journey reads the facts of the project and draws the strip with its amount', async () => {
  renderPage(
    <JourneyPanel
      projectId={projectId}
      runId={undefined}
      refresh="a"
      pagePath={`/projects/${projectId}/start`}
      deepenRunId=""
    />,
    { [`GET ${projectPath}`]: json(200, { ...facts({ budget }) }) },
  );

  await screen.findByRole('region', { name: 'Journey from code to package' });

  expect(region().textContent).toContain('$0.60 left of $1.00 approved');
});

it('RF-1020 the strip is also on the page of an understand run that is still working', async () => {
  const run = { id: sourceId, projectId } as Parameters<typeof UnderstandJourney>[0]['run'];

  renderPage(
    <UnderstandJourney
      run={run}
      stage="understand"
      phase={{ kind: 'running' }}
      onResumed={() => undefined}
    />,
    { [`GET ${projectPath}?run=${sourceId}`]: json(200, roadSigns['running']) },
  );

  await waitFor(() => {
    expect(region().textContent).toContain('Running now');
  });
});
