import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import {
  agentEnded,
  cardProposed,
  citationChecked,
  ev,
  planned,
  runEnded,
  startedData,
} from './live-run-fixtures.js';
import { failure, json } from './fake-api.js';
import { renderLive, runPath, runRow } from './live-run-helpers.js';

// RF-1002, RF-1003, RF-1004, design-system.md section 5 (pipeline stepper) (P1-95): the stage
// stepper above the panels of the page of an ended run (the page while it runs has the run journey,
// see live-run-running-page.test.tsx). It is an ordered list; the current step carries
// aria-current="step"; the counts come from the events.

afterEach(() => {
  vi.unstubAllGlobals();
});

const pipeline = (): HTMLElement => screen.getByRole('list', { name: 'Pipeline' });
const step = (name: string): HTMLElement => {
  const found = within(pipeline())
    .getAllByRole('listitem')
    .find((item) => item.textContent.startsWith(name));
  if (found === undefined) throw new Error(`No step ${name}.`);
  return found;
};

it('RF-1002 a finished run has the report step waiting and no step current', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(cardProposed(3, 'reader-001', 'BR-001', 1));
  connection.event(citationChecked(4, 'reader-001', 'BR-001.c1', true));
  connection.event(agentEnded(5, 'reader-001', 'Done', 1));
  connection.event(runEnded(6, 'Completed'));

  await waitFor(() => {
    expect(step('Verify').textContent).toContain('done');
  });
  expect(step('Understand').textContent).toContain('1 of 1 agents done');
  expect(step('Report').textContent).toContain('waiting');
  expect(pipeline().querySelectorAll('[aria-current]')).toHaveLength(0);
});

it('RF-1002 a scan run shows the files and areas scanned and leaves Understand waiting', async () => {
  const { stream } = renderLive({});
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', { ...startedData, stage: 'scan' }));
  connection.event(
    ev(2, 'source.resolved', { url: 'https://github.com/octo/demo', commitSha: 'a'.repeat(40) }),
  );
  connection.event(ev(3, 'scan.completed', { files: 36, areas: 4 }));
  connection.event(runEnded(4, 'Completed'));

  await waitFor(() => {
    expect(step('Scan').textContent).toContain('36 files, 4 areas');
  });
  expect(step('Understand').textContent).toContain('waiting');
});

/** The page of an understand run that has ended, its run row as `row` answers it. */
async function endedRun(row: Response, answers: Parameters<typeof renderLive>[0] = {}) {
  // RF-264: the page of an ended understand run also reads its overview.
  const overview = { [`GET ${runPath}/overview`]: json(200, { overview: null }) };
  const page = renderLive({ [`GET ${runPath}`]: row, ...overview, ...answers });
  const connection = await page.stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  connection.event(runEnded(2, 'Completed'));
  return page;
}

it('RF-1002 RF-504 the Report step of an ended run turns done as soon as the report is built from the page', async () => {
  await endedRun(runRow({ queueState: 'Ended', endState: 'Completed' }), {
    [`POST ${runPath}/report`]: json(200, { files: ['report/report.html', 'report/report.md'] }),
  });
  const build = await screen.findByRole('button', { name: 'Build report' });
  await waitFor(() => {
    expect(build.hasAttribute('disabled')).toBe(false);
  });
  expect(step('Report').textContent).toContain('waiting');

  fireEvent.click(build);

  await waitFor(() => {
    expect(step('Report').textContent).toContain('done');
  });
  expect(step('Report').getAttribute('data-state')).toBe('done');
});

it('RF-1002 RF-504 the Report step stays waiting when the build is refused', async () => {
  await endedRun(runRow({ queueState: 'Ended', endState: 'Completed' }), {
    [`POST ${runPath}/report`]: failure(409, 'RST-1700'),
  });
  const build = await screen.findByRole('button', { name: 'Build report' });
  await waitFor(() => {
    expect(build.hasAttribute('disabled')).toBe(false);
  });

  fireEvent.click(build);

  await screen.findByRole('alert');
  expect(step('Report').textContent).toContain('waiting');
});

it('RF-1002 RF-504 the Report step of a run whose report was built earlier is done on load', async () => {
  await endedRun(runRow({ queueState: 'Ended', endState: 'Completed', reportBuilt: true }));

  await waitFor(() => {
    expect(step('Report').textContent).toContain('done');
  });
  expect(step('Report').getAttribute('data-state')).toBe('done');
});
