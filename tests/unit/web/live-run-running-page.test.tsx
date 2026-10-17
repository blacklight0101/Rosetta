import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import {
  agentEnded,
  agentStarted,
  cardProposed,
  citationChecked,
  ev,
  planned,
  runEnded,
  startedData,
  toolCalled,
} from './live-run-fixtures.js';
import { renderLive, runPath, runRow, runUuid } from './live-run-helpers.js';
import { codeMapAnswer, codeMapPath, openTab, ownAreas, tab } from './live-run-running-helpers.js';

// RF-1015, RF-1016, RF-1002..RF-1005, RF-1010, RF-1011 (P1-169): the page of a run while it runs:
// the journey, the living code map, the spend, "working now" and the tabs.

afterEach(() => {
  vi.unstubAllGlobals();
});

const withMap = { [`GET ${codeMapPath}`]: codeMapAnswer(ownAreas) };

const reading = [
  ev(1, 'run.started', startedData),
  planned(2, 'r1', 'Catalog'),
  planned(3, 'r2', 'Models'),
  agentStarted(4, 'r1', 'Catalog'),
  toolCalled(5, 'r1', { path: 'Catalog/Create.aspx.cs', startLine: 1, endLine: 80 }),
  agentStarted(6, 'r2', 'Models'),
  cardProposed(7, 'r2', 'BR-001', 2),
  citationChecked(8, 'r2', 'BR-001.c1', true),
];

async function openRunning(events = reading, answers = withMap): Promise<void> {
  const { stream } = renderLive(answers);
  const connection = await stream.connection();
  for (const event of events) connection.event(event);
  await screen.findByRole('list', { name: 'Run progress' });
  await waitFor(() => {
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(5);
  });
}

const tiles = (): HTMLElement => screen.getByRole('list', { name: 'Areas of the code' });

it('RF-1015 the running page has the journey, the code map, the spend, working now and the tabs', async () => {
  await openRunning();

  const journey = screen.getByRole('list', { name: 'Run progress' });
  expect(within(journey).getAllByRole('listitem')).toHaveLength(5);
  expect(screen.getByRole('region', { name: 'The code, area by area' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Spend for this run' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Working now' })).toBeTruthy();
  expect(screen.getByRole('tablist', { name: 'Run details' })).toBeTruthy();
  expect(screen.getAllByRole('tab').map((each) => each.textContent)).toEqual([
    expect.stringMatching(/^Cards so far/u),
    expect.stringMatching(/^All agents/u),
    expect.stringMatching(/^Activity/u),
  ]);
});

it('RF-1015 the journey marks the current step and says every state in words', async () => {
  await openRunning();

  const journey = screen.getByRole('list', { name: 'Run progress' });
  const items = within(journey).getAllByRole('listitem');
  const read = items.find((item) => item.textContent.includes('Read'));
  expect(read?.getAttribute('aria-current')).toBe('step');
  expect(read?.textContent).toContain('0 of 2 areas');
  expect(read?.textContent).toContain('in progress');
  expect(items[0]?.textContent).toContain('done');
  expect(items.at(-1)?.textContent).toContain('waiting');
  expect(journey.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
});

it('RF-1016 the code map has a tile per area with its state in words, and library areas left out', async () => {
  await openRunning();

  await waitFor(() => {
    expect(within(tiles()).getAllByRole('listitem')).toHaveLength(4);
  });
  const catalog = within(tiles()).getByRole('button', { name: /Catalog/u });
  expect(catalog.textContent).toContain('being read');
  expect(within(tiles()).getByRole('button', { name: /Models/u }).textContent).toContain('1 card');
  expect(within(tiles()).getByRole('button', { name: /Setup/u }).textContent).toContain(
    'not covered',
  );
  const library = within(tiles()).getByText('jQuery').closest('li');
  expect(library?.textContent).toContain('library, left out');
  expect(library?.querySelector('button')).toBeNull();
  expect(library?.getAttribute('data-state')).toBe('library');
});

it('RF-1016 an area name that holds HTML is shown as text and a long name keeps its full text in a title', async () => {
  const longName = 'A'.repeat(60);
  await openRunning(
    [
      ev(1, 'run.started', startedData),
      planned(2, 'r1', '<img src=x onerror=alert(1)>'),
      planned(3, 'r2', longName),
    ],
    {
      [`GET ${codeMapPath}`]: codeMapAnswer([
        { name: '<img src=x onerror=alert(1)>', estimatedTokens: 100, thirdParty: false },
        { name: longName, estimatedTokens: 100, thirdParty: false },
      ]),
    },
  );

  await waitFor(() => {
    expect(within(tiles()).getAllByRole('listitem')).toHaveLength(2);
  });
  expect(tiles().querySelector('img')).toBeNull();
  expect(within(tiles()).getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  expect(within(tiles()).getByText(longName).getAttribute('title')).toBe(longName);
});

it('RF-1016 one area and 120 areas both draw', async () => {
  const many = Array.from({ length: 120 }, (_, index) => ({
    name: `Area ${String(index)}`,
    estimatedTokens: 100 + index,
    thirdParty: false,
  }));
  await openRunning([ev(1, 'run.started', startedData), planned(2, 'r1', 'Area 0')], {
    [`GET ${codeMapPath}`]: codeMapAnswer(many),
  });

  await waitFor(() => {
    expect(within(tiles()).getAllByRole('listitem')).toHaveLength(120);
  });
});

it('RF-1016 a tile opens its agent and cards in the All agents tab, and the tab can show every agent again', async () => {
  await openRunning();
  await waitFor(() => {
    expect(within(tiles()).getAllByRole('listitem')).toHaveLength(4);
  });

  fireEvent.click(within(tiles()).getByRole('button', { name: /Models/u }));

  expect(tab('All agents').getAttribute('aria-selected')).toBe('true');
  const panel = screen.getByRole('tabpanel');
  expect(within(panel).getByLabelText('Agent Models')).toBeTruthy();
  expect(within(panel).queryByLabelText('Agent Catalog')).toBeNull();
  expect(within(panel).getByText('BR-001')).toBeTruthy();

  fireEvent.click(within(panel).getByRole('button', { name: 'Show all agents' }));

  expect(within(screen.getByRole('tabpanel')).getByLabelText('Agent Catalog')).toBeTruthy();
});

it('RF-1015 working now says in words what at most three agents do', async () => {
  await openRunning();

  const now = screen.getByRole('region', { name: 'Working now' });
  await waitFor(() => {
    expect(now.textContent).toContain('1 claim checked, all cite real lines');
  });
  expect(within(now).getAllByRole('listitem').length).toBeLessThanOrEqual(3);
  expect(now.textContent).toContain('Reader · Catalog');
  expect(now.textContent).toContain('Reading Catalog/Create.aspx.cs, lines 1–80');
  expect(now.textContent).toContain('Citation check');
});

it('RF-1003 the spend shows the cost against its cap and reaches the per-role table and the estimate in one click', async () => {
  const { stream } = renderLive({
    ...withMap,
    [`GET ${runPath}`]: runRow({ costMicros: 500_000 }),
  });
  const connection = await stream.connection();
  for (const event of reading) connection.event(event);

  const spend = await screen.findByRole('region', { name: 'Spend for this run' });
  await waitFor(() => {
    expect(spend.textContent).toContain('$0.50');
  });
  expect(spend.textContent).toContain('cap $2.00');
  const meter = within(spend).getByRole('meter', { name: 'Spend against the cap' });
  expect(meter.getAttribute('aria-valuenow')).toBe('25');

  fireEvent.click(within(spend).getByRole('button', { name: 'Cost per role and estimate' }));

  expect(tab('All agents').getAttribute('aria-selected')).toBe('true');
  const meterRegion = within(screen.getByRole('tabpanel')).getByRole('region', {
    name: 'Run meter',
  });
  expect(within(meterRegion).getByRole('row', { name: /Total/u })).toBeTruthy();
});

it('RF-1011 the provider calls and logs are one click away from the page', async () => {
  await openRunning();

  const link = screen.getAllByRole('link', { name: 'API calls and logs' })[0];

  expect(link?.getAttribute('href')).toBe(`/runs/${runUuid}/calls`);
});

it('RF-1002 RF-1004 the tabs hold the cards, the agents with their overview and the event log', async () => {
  await openRunning();

  const cards = screen.getByRole('tabpanel');
  expect(within(cards).getByText('Title of BR-001')).toBeTruthy();
  expect(within(cards).getByRole('region', { name: 'Claims' })).toBeTruthy();

  const agents = openTab('All agents');
  expect(within(agents).getByRole('region', { name: 'Overview' })).toBeTruthy();
  expect(within(agents).getByLabelText('Agent Catalog')).toBeTruthy();
  expect(within(agents).getByRole('region', { name: 'Coverage map' })).toBeTruthy();

  const activity = openTab('Activity');
  expect(within(activity).getByRole('log', { name: 'Event log' })).toBeTruthy();
  expect(within(activity).getByRole('link', { name: 'API calls and logs' })).toBeTruthy();
});

it('RF-1015 the tabs follow the tab pattern with the arrow keys, Home and End', async () => {
  await openRunning();
  const first = tab('Cards so far');
  first.focus();

  fireEvent.keyDown(first, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(tab('All agents'));
  expect(tab('All agents').getAttribute('aria-selected')).toBe('true');
  expect(tab('All agents').getAttribute('tabindex')).toBe('0');
  expect(first.getAttribute('tabindex')).toBe('-1');

  fireEvent.keyDown(tab('All agents'), { key: 'End' });
  expect(tab('Activity').getAttribute('aria-selected')).toBe('true');

  fireEvent.keyDown(tab('Activity'), { key: 'ArrowRight' });
  expect(tab('Cards so far').getAttribute('aria-selected')).toBe('true');

  fireEvent.keyDown(tab('Cards so far'), { key: 'ArrowLeft' });
  expect(tab('Activity').getAttribute('aria-selected')).toBe('true');

  fireEvent.keyDown(tab('Activity'), { key: 'Home' });
  expect(tab('Cards so far').getAttribute('aria-selected')).toBe('true');
  const panel = screen.getByRole('tabpanel');
  expect(panel.getAttribute('aria-labelledby')).toBe(tab('Cards so far').id);
  expect(tab('Cards so far').getAttribute('aria-controls')).toBe(panel.id);
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
});

it('RF-1015 only the selected tab draws its list', async () => {
  await openRunning();

  expect(document.querySelectorAll('[data-testid="card-row"]')).toHaveLength(1);
  expect(document.querySelector('[role="log"]')).toBeNull();
  expect(document.querySelector('[aria-label="Agent Catalog"]')).toBeNull();
});

it('RF-1015 a queued run shows the journey waiting and no tiles', async () => {
  renderLive({ ...withMap, [`GET ${runPath}`]: runRow({ queueState: 'Queued' }) });

  const journey = await screen.findByRole('list', { name: 'Run progress' });

  expect(journey.textContent).toContain('waiting in the queue');
  expect(journey.querySelector('[aria-current="step"]')).toBeNull();
});

it('RF-1015 a run that fails at its first step leaves the running page for the ended one with the failure', async () => {
  const { stream } = renderLive(withMap);
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  await screen.findByRole('list', { name: 'Run progress' });

  connection.event(runEnded(2, 'Failed', 'RST-1500'));

  await waitFor(() => {
    expect(screen.queryByRole('list', { name: 'Run progress' })).toBeNull();
  });
  expect((await screen.findByTestId('run-failure')).textContent).toContain('RST-1500');
  expect(screen.getByRole('list', { name: 'Pipeline' })).toBeTruthy();
});

it('RF-1015 an ended run leaves the running page: the pipeline stays and the results tabs replace the run details', async () => {
  const { stream } = renderLive(withMap);
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'r1', 'Catalog'));
  connection.event(agentStarted(3, 'r1', 'Catalog'));
  connection.event(agentEnded(4, 'r1', 'Done'));
  connection.event(runEnded(5, 'Completed'));

  await screen.findByRole('list', { name: 'Pipeline' });

  expect(screen.getByRole('tablist', { name: 'Results' })).toBeTruthy();
  expect(screen.queryByRole('tablist', { name: 'Run details' })).toBeNull();
  expect(screen.queryByRole('list', { name: 'Run progress' })).toBeNull();
});
