import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { failure, json } from './fake-api.js';
import { ev, runEnded, startedData } from './live-run-fixtures.js';
import { renderLive, runPath, runRow } from './live-run-helpers.js';
import { openEnded, question } from './ended-run-helpers.js';
import { tab } from './live-run-running-helpers.js';

// RF-1015, RF-1017, RF-1014 (P1-170): the page of a run that has ended, "after the run" mode: the
// overview first, the "Your turn" panel with the run facts and the next actions, and the tabs for
// the questions, the evidence and the activity.

afterEach(() => {
  vi.unstubAllGlobals();
});

const turnPanel = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });

it('RF-1015 an ended run opens with the Overview tab first and the other three tabs after it', async () => {
  await openEnded();

  const names = within(screen.getByRole('tablist', { name: 'Results' }))
    .getAllByRole('tab')
    .map((each) => each.textContent);
  expect(names).toEqual([
    'Overview',
    expect.stringMatching(/^Your questions/u),
    expect.stringMatching(/^Evidence/u),
    expect.stringMatching(/^Activity/u),
  ]);
  expect(tab('Overview').getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByRole('tablist', { name: 'Run details' })).toBeNull();
  expect(await screen.findByRole('region', { name: 'Overview of the application' })).toBeTruthy();
});

it('RF-1015 the Your turn panel counts the open questions and its button opens the questions tab', async () => {
  await openEnded();

  await waitFor(() => {
    expect(turnPanel().textContent).toContain('3 questions');
  });
  fireEvent.click(within(turnPanel()).getByRole('button', { name: 'Answer 3 questions' }));

  expect(tab('Your questions').getAttribute('aria-selected')).toBe('true');
  expect(within(screen.getByRole('tabpanel')).getAllByTestId('open-question')).toHaveLength(3);
});

it('RF-1015 the Your turn panel shows the run facts', async () => {
  await openEnded();

  const facts = within(turnPanel()).getByRole('list', { name: 'Run facts' });
  const text = (label: string): string =>
    within(facts).getByText(label).closest('li')?.textContent ?? '';
  await waitFor(() => {
    expect(text('Cost')).toContain('$0.0041');
  });
  expect(text('Cards')).toContain('1');
  expect(text('Citations passed')).toContain('1 / 2');
  expect(text('Areas read')).toContain('1 / 1');
});

it('RF-008 RF-504 the report and the downloads stay one click away on the ended page', async () => {
  await openEnded();

  const report = screen.getByRole('region', { name: 'Report' });
  expect(within(report).getByRole('button', { name: 'Build report' })).toBeTruthy();
  const downloads = screen.getByRole('group', { name: 'Downloads' });
  expect(within(downloads).getByRole('link', { name: 'Download zip' })).toBeTruthy();
});

it('RF-1015 the tabs follow the tab pattern with the arrow keys, Home and End', async () => {
  await openEnded();
  const overview = tab('Overview');

  fireEvent.keyDown(overview, { key: 'ArrowRight' });

  expect(tab('Your questions').getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(tab('Your questions'));
  expect(overview.getAttribute('tabindex')).toBe('-1');
  const panel = screen.getByRole('tabpanel');
  expect(panel.getAttribute('aria-labelledby')).toBe(tab('Your questions').id);
  fireEvent.keyDown(tab('Your questions'), { key: 'End' });
  expect(tab('Activity').getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(tab('Activity'), { key: 'Home' });
  expect(tab('Overview').getAttribute('aria-selected')).toBe('true');
});

it('RF-1015 the page switches by itself from the running mode to the after-the-run mode', async () => {
  const { stream } = renderLive({
    [`GET ${runPath}/overview`]: json(200, { overview: null }),
    [`GET ${runPath}/answers`]: json(200, { questions: [question(1)] }),
  });
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  await screen.findByRole('tablist', { name: 'Run details' });
  expect(screen.queryByRole('tablist', { name: 'Results' })).toBeNull();

  connection.event(runEnded(2, 'Completed'));

  expect(await screen.findByRole('tablist', { name: 'Results' })).toBeTruthy();
  expect(screen.queryByRole('tablist', { name: 'Run details' })).toBeNull();
  expect(tab('Overview').getAttribute('aria-selected')).toBe('true');
});

it('RF-1017 RF-1014 the Overview tab says what was checked and what was not, and what was not covered', async () => {
  await openEnded();

  const note = await screen.findByTestId('verification-note');
  expect(note.textContent).toContain('2 of 2 citations checked');
  expect(note.textContent).toContain('those claims were not judged');
  const region = screen.getByRole('region', { name: 'Overview of the application' });
  expect(region.textContent).toContain('Third-party code (1)');
  expect(region.textContent).toContain('What was not covered');
});

it('RF-1015 the Evidence tab holds the cards, the claims, the coverage and the code map', async () => {
  await openEnded();

  fireEvent.click(tab('Evidence'));

  const panel = screen.getByRole('tabpanel');
  expect(within(panel).getByRole('list', { name: 'Cards so far' })).toBeTruthy();
  expect(within(panel).getByRole('region', { name: 'Claims' })).toBeTruthy();
  expect(within(panel).getByRole('region', { name: 'Coverage map' })).toBeTruthy();
  expect(await within(panel).findByRole('region', { name: 'The code, area by area' })).toBeTruthy();
});

it('RF-1015 the Activity tab holds the event log, the calls and logs, and the replay', async () => {
  await openEnded();

  fireEvent.click(tab('Activity'));

  const panel = screen.getByRole('tabpanel');
  expect(within(panel).getByRole('log', { name: 'Event log' })).toBeTruthy();
  expect(within(panel).getByRole('link', { name: 'API calls and logs' })).toBeTruthy();
  expect(within(panel).getByTestId('replay-note').textContent).toContain('replay');
});

it('RF-1017 a run with no questions says so in the Your turn panel and in the tab', async () => {
  await openEnded({ questions: [] });

  await waitFor(() => {
    expect(turnPanel().textContent).toContain('no questions');
  });
  expect(within(turnPanel()).queryByRole('button', { name: /^Answer/u })).toBeNull();
  fireEvent.click(tab('Your questions'));
  expect(screen.getByRole('tabpanel').textContent).toContain('This run added no open questions.');
});

it('RF-1017 forty questions are all listed and counted', async () => {
  const many = Array.from({ length: 40 }, (_, index) => question(index + 1));
  await openEnded({ questions: many });

  await waitFor(() => {
    expect(turnPanel().textContent).toContain('40 questions');
  });
  fireEvent.click(tab('Your questions'));
  expect(within(screen.getByRole('tabpanel')).getAllByTestId('open-question')).toHaveLength(40);
});

it('RF-1015 a failed run has no overview: the page says what failed and what to do', async () => {
  const { stream } = renderLive({
    [`GET ${runPath}`]: runRow({ queueState: 'Ended', endState: 'Failed' }),
    [`GET ${runPath}/overview`]: json(200, { overview: null }),
    [`GET ${runPath}/answers`]: json(200, { questions: [] }),
    'GET /api/errors/RST-1901': json(200, {
      code: 'RST-1901',
      message: 'The branch, tag or commit was not found in this repository.',
      nextStep: 'Check the ref in the address.',
    }),
  });
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  connection.event(runEnded(2, 'Failed', 'RST-1901'));

  const failed = await screen.findByTestId('run-failure');

  await waitFor(() => {
    expect(failed.textContent).toContain('The branch, tag or commit was not found');
  });
  expect(failed.textContent).toContain('Check the ref in the address.');
  expect(screen.queryByRole('tab', { name: 'Overview' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Overview of the application' })).toBeNull();
  expect(turnPanel().textContent).toContain('did not finish');
  expect(tab('Evidence').getAttribute('aria-selected')).toBe('true');
});

it('RF-1015 a run that is not an understand run has the evidence and activity tabs only', async () => {
  renderLive({
    [`GET ${runPath}`]: runRow({ stage: 'plan', queueState: 'Ended', endState: 'Completed' }),
    [`GET ${runPath}/answers`]: failure(404, 'RST-1000'),
  });

  await screen.findByRole('tablist', { name: 'Results' });
  expect(
    within(screen.getByRole('tablist', { name: 'Results' }))
      .getAllByRole('tab')
      .map((each) => each.textContent),
  ).toEqual([expect.stringMatching(/^Evidence/u), expect.stringMatching(/^Activity/u)]);
});

it('RF-230 the Evidence tab lists the files and the areas nobody read as not read', async () => {
  const listing = {
    areas: [
      {
        area: 'Catalog',
        files: [
          { path: 'Catalog/Edit.cs', read: [{ startLine: 1, endLine: 30 }] },
          { path: 'Catalog/Other.cs', read: [] },
        ],
      },
    ],
  };
  await openEnded({ extra: { [`GET ${runPath}/coverage`]: json(200, listing) } });

  fireEvent.click(tab('Evidence'));

  const map = await screen.findByRole('region', { name: 'Coverage map' });
  await waitFor(() => {
    expect(within(map).getByRole('region', { name: 'Coverage of Catalog' }).textContent).toContain(
      'Other.cs',
    );
  });
  expect(within(map).getByRole('region', { name: 'Coverage of Models' }).textContent).toContain(
    'No files read yet.',
  );
  expect(within(map).getAllByText('not read')).toHaveLength(1);
});

it('RF-230 a scan has no files read per area, so its page does not ask for them', async () => {
  const page = await openEnded({ stage: 'scan' });

  expect(page.calls.map((call) => call.path)).not.toContain(`${runPath}/coverage`);
});
