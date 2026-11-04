import { screen, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { history } from './history-fixtures.js';
import { facts, planId, projectId, roadSigns, source } from './journey-fixtures.js';
import { projectOf } from './project-fixtures.js';
import { projectPath } from './start-run-fixtures.js';
import { renderStart } from './start-run-helpers.js';

// RF-1021, RF-1020, RF-1022, DEC-211 (P8-26, P8Project): the project page in its three states: before
// the first run, with questions waiting and with the package written. After a run it is titled with the
// project name and the step, holds no upload form in view, links a live run, and keeps the areas and
// Analyse folded under "Start another run".

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const zip = projectOf(projectId, 'OrderDesk', {
  sourceUrl: '',
  sourceKind: 'upload',
  source: { fileName: 'OrderDesk.zip', uploadedAt: '2026-10-19T08:00:00.000Z' },
});

const journeyPath = `GET /api/projects/${projectId}/journey`;
const historyPath = `GET /api/projects/${projectId}/history`;

const runs = history.runs.map((run) => ({ ...run, queueState: 'Ended' as const }));
const done = { ...history, runs };

function open(name: string, extra: Record<string, Response> = {}) {
  return renderStart({
    [`GET ${projectPath}`]: json(200, zip),
    // The scan has finished (scanRunId), so the estimate is asked for.
    [journeyPath]: json(200, { ...(roadSigns[name] ?? facts()), scanRunId: 'scan-1' }),
    [historyPath]: json(200, done),
    ...extra,
  });
}

const heading = (): HTMLElement => screen.getByRole('heading', { level: 1 });

it('RF-1021 before the first run the page is "Start a run" with the upload form in view', async () => {
  open('noRun');

  await screen.findByLabelText('Zip file');

  expect(heading().textContent).toBe('Start a run');
  expect(screen.queryByTestId('replace-source')).toBeNull();
});

it('RF-1021 with a package written the page is titled with the project and "Package ready"', async () => {
  open('written');

  await screen.findByText('Package ready');

  expect(heading().textContent).toBe('OrderDesk');
  expect(screen.queryByRole('heading', { name: 'Start a run' })).toBeNull();
});

it('RF-1021 questions waiting are titled "Questions waiting"', async () => {
  open('asking');

  await screen.findByText('Questions waiting', { selector: '[data-testid="project-status"]' });

  expect(heading().textContent).toBe('OrderDesk');
});

it('RF-1021 the package state has no upload form in view: the upload is under a collapsed "Replace the source"', async () => {
  open('written');
  await screen.findByText('Package ready');
  await screen.findByTestId('start-another');

  const fold = screen.getByTestId('replace-source');

  expect(fold.tagName).toBe('DETAILS');
  expect(fold.hasAttribute('open')).toBe(false);
  expect(within(fold).getByText('Replace the source')).toBeTruthy();
  expect(within(fold).getByLabelText('Zip file')).toBeTruthy();
});

it('RF-1021 the package state shows the package, its cost, the questions left on defaults and the runs', async () => {
  const planned = facts({
    ...roadSigns['written'],
    source: source({ openQuestions: 3 }),
    briefSaved: true,
    budget: {
      approvedMicros: 4_000_000,
      remainingMicros: 3_850_000,
      approvedTokens: 0,
      remainingTokens: 0,
    },
  });
  open('written', { [journeyPath]: json(200, { ...planned, scanRunId: 'scan-1' }) });

  await screen.findByRole('heading', { name: 'Hand-off package' });

  const link = screen.getByRole('link', { name: 'Download hand-off zip' });
  expect(link.getAttribute('href')).toContain(planId);
  expect(screen.getByRole('link', { name: 'Open the plan run' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Change the brief and plan again' })).toBeTruthy();
  expect(screen.getByText('Journey cost')).toBeTruthy();
  expect(screen.getAllByText('$3.85 left of $4.00 approved').length).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: 'See the cost by run' })).toBeTruthy();
  expect(screen.getByText('3 questions were left on their recommended answers.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Review the answers' })).toBeTruthy();
  expect(screen.getByRole('table', { name: 'Runs of this project' })).toBeTruthy();
  expect(screen.getByRole('link', { name: history.runs[3]?.runId ?? '' })).toBeTruthy();
});

it('RF-1021 RF-1022 the areas and Analyse are folded under "Start another run" once there is a run', async () => {
  open('written');
  await screen.findByText('Package ready');

  const fold = await screen.findByTestId('start-another');

  expect(fold.tagName).toBe('DETAILS');
  expect(fold.hasAttribute('open')).toBe(false);
});

it('RF-1021 a run with nothing to plan from keeps the areas and Analyse open', async () => {
  open('noClaims');

  const fold = await screen.findByTestId('start-another');

  expect(fold.hasAttribute('open')).toBe(true);
  expect(within(fold).getByRole('button', { name: /^Analyse/u })).toBeTruthy();
});

it('RF-1020 RF-1021 a live Deepen makes its strip step a link to the run and says so in the title', async () => {
  const deepening = facts({
    source: source({ openQuestions: 2, deepening: true }),
    briefSaved: false,
  });
  const live = {
    ...history,
    runs: [{ ...history.runs[0], id: 'live-deepen' }, ...runs.slice(1)],
  };
  open('asking', { [journeyPath]: json(200, deepening), [historyPath]: json(200, live) });

  const status = await screen.findByText('Deepen running');

  expect(status.closest('a')?.getAttribute('href')).toBe('/runs/live-deepen');
  const step = screen.getByRole('link', { name: 'Questions' });
  expect(step.getAttribute('href')).toBe('/runs/live-deepen');
});

it('RF-1020 P8-100 the project page keeps the journey strip expanded and offers no button to fold it', async () => {
  open('written');
  await screen.findByText('Package ready');

  const journey = await screen.findByRole('region', { name: 'Journey from code to package' });

  expect(within(journey).queryByRole('button', { name: /step details/u })).toBeNull();
  const bodies = Array.from(journey.querySelectorAll<HTMLElement>('.rst-road__body'));
  expect(bodies).toHaveLength(7);
  for (const each of bodies) expect(each.hidden).toBe(false);
});
