import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { json } from './fake-api.js';
import { ev, runEnded, startedData } from './live-run-fixtures.js';
import { renderLive, runPath, runRow, runUuid } from './live-run-helpers.js';
import { codeMapAnswer, codeMapPath, ownAreas } from './live-run-running-helpers.js';
import { openEnded, question } from './ended-run-helpers.js';
import { facts, planRun, projectId, source } from './journey-fixtures.js';

// RF-1015, RF-1017, RF-1020 (P8-27, UX-11..UX-14, UX-22): the run page fits the kind of run: its
// title says the run and its state, a scan shows its code map and zip only, each figure is shown
// once, and the number of questions is the same in the panel and in the tab.

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openScan(): Promise<void> {
  const page = renderLive({
    [`GET ${runPath}`]: runRow({ stage: 'scan', queueState: 'Ended', endState: 'Completed' }),
    [`GET ${codeMapPath}`]: codeMapAnswer(ownAreas),
  });
  const connection = await page.stream.connection();
  connection.event(ev(1, 'run.started', { ...startedData, stage: 'scan' }));
  connection.event(ev(2, 'scan.completed', { files: 36, areas: 4 }));
  connection.event(runEnded(3, 'Completed'));
  await screen.findByRole('heading', { level: 1, name: 'Scan, done' });
}

it('RF-1015 a scan that ended is titled "Scan, done" with its folder name under the title', async () => {
  await openScan();

  expect(screen.queryByText('Live run')).toBeNull();
  // RF-1015: the folder name is a line of its own after the title, in the DOM and in the style sheet.
  const title = screen.getByRole('heading', { level: 1 });
  const key = screen.getByText('20261012-100000-understand');
  expect(title.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const sheet = await readFile(resolve(process.cwd(), 'web/src/styles/live-run.css'), 'utf8');
  const rule = sheet.slice(sheet.indexOf('.rst-live-head__key {'));
  expect(rule.slice(0, rule.indexOf('}'))).toContain('flex-basis: 100%');
});

it('RF-1015 a scan run page shows its code map and its zip, and nothing of understand', async () => {
  await openScan();

  const map = await screen.findByRole('region', { name: 'Code map' });
  // The code map is the run's own summary, not the project's current map.
  expect(within(map).getByTestId('scan-summary').textContent).toBe('36 files in 4 areas.');
  expect(screen.getByRole('link', { name: 'Download zip' })).toBeTruthy();
  expect(screen.queryByText('Download hand-off zip')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Your turn' })).toBeNull();
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.queryByText('Build report')).toBeNull();
  expect(screen.queryByText('Understand')).toBeNull();
  expect(screen.queryByText('Verify')).toBeNull();
});

it('RF-1015 an understand run that ended is titled "Understand, done"', async () => {
  await openEnded();

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Understand, done');
});

it('RF-1015 an understand run that works is titled "Understand, running"', async () => {
  const page = renderLive();
  const connection = await page.stream.connection();
  connection.event(ev(1, 'run.started', startedData));

  expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
    'Understand, running',
  );
});

it('RF-1015 the figures of the run are five and each one is shown once', async () => {
  const area = { area: 'Catalog', files: [], firstPartyShare: 0.9 };
  const coverage = { [`GET ${runPath}/coverage`]: json(200, { areas: [area] }) };
  await openEnded({ judged: 'Supported', extra: coverage });

  const facts = within(screen.getByRole('region', { name: 'Your turn' })).getByRole('list', {
    name: 'Run facts',
  });
  expect(await within(facts).findByText('all read')).toBeTruthy();
  const labels = within(facts)
    .getAllByRole('listitem')
    .map((each) => [...each.children].find((child) => child.tagName === 'SPAN')?.textContent);
  expect(labels).toEqual(['Supported claims', 'Cards', 'Areas', 'Cost', 'Tokens']);
  const supported = within(facts).getByText('Supported claims').closest('li');
  await waitFor(() => {
    expect(supported?.textContent).toContain('of 1 judged');
  });
  expect(supported?.textContent).toContain('1');
  expect(screen.queryByText('Citations passed')).toBeNull();
});

it('RF-1017 a panel with no question waiting and one saved answer agrees with the tab count', async () => {
  await openEnded({ questions: [question(1, { answer: 'Keep it.' })] });

  await waitFor(() => {
    expect(screen.getByRole('region', { name: 'Your turn' }).textContent).toContain(
      'No question waits for you',
    );
  });
  expect(screen.getByRole('region', { name: 'Your turn' }).textContent).not.toContain(
    'Every question has',
  );
  expect(screen.getByRole('tab', { name: /^Your questions/u }).textContent).toContain('0');
});

it('RF-1017 the panel and the tab count the same waiting questions', async () => {
  await openEnded({ questions: [question(1), question(2), question(3, { answer: 'x' })] });

  await waitFor(() => {
    expect(screen.getByRole('region', { name: 'Your turn' }).textContent).toContain('2 questions');
  });
  expect(screen.getByRole('tab', { name: /^Your questions/u }).textContent).toContain('2');
});

it('RF-1020 the strip says its Supported claims are those of the journey', async () => {
  await openEnded({
    extra: { [`GET /api/projects/${projectId}/journey`]: json(200, facts({ source: source() })) },
  });

  expect(await screen.findByText('4 Supported claims of the journey')).toBeTruthy();
});

it('RF-1015 Open the package on the finished plan run scrolls to the package section and focuses it', async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  const written = facts({
    plan: planRun({ id: runUuid }),
    handoff: { runId: runUuid, runKey: 'k', outOfDate: false, gaps: false },
  });
  await openEnded({
    stage: 'plan',
    extra: { [`GET /api/projects/${projectId}/journey`]: json(200, written) },
  });

  fireEvent.click(await screen.findByRole('button', { name: 'Open the package' }));

  const section = screen.getByRole('region', { name: 'Package' });
  expect(scroll).toHaveBeenCalled();
  expect(document.activeElement).toBe(section);
  expect(within(section).getByRole('link', { name: 'Download hand-off zip' })).toBeTruthy();
});
