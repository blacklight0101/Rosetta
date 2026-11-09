import { screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { failure, json } from './fake-api.js';
import { openEnded } from './ended-run-helpers.js';
import { runPath } from './live-run-helpers.js';
import { openTab } from './live-run-running-helpers.js';
import { measures, understanding, understandingPath } from './understanding-fixtures.js';

// RF-230, RF-231 (P8-93, UX-23): the page of an ended understand run says an area read below the
// coverage bar is "partly read (16%)" everywhere it names the areas: the header badge, the Areas
// figure and the code map. While the coverage is loading, or cannot be read, it says no verdict.
// The Asset Manager case: the run reads the Catalog area and reads 16% of its first-party tokens.

afterEach(() => {
  vi.unstubAllGlobals();
});

const coveragePath = `GET ${runPath}/coverage`;
const catalog = (firstPartyShare?: number) => ({
  area: 'Catalog',
  files: [],
  ...(firstPartyShare === undefined ? {} : { firstPartyShare }),
});
const coverage = (share?: number) => ({ [coveragePath]: json(200, { areas: [catalog(share)] }) });
const covered = (share: number) => ({
  ...coverage(share),
  [understandingPath]: understanding(measures({ firstPartyCoverage: share })),
});
const turnPanel = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });
const areasFact = (): string =>
  within(turnPanel()).getByText('Areas').closest('li')?.textContent ?? '';
const badge = (): string =>
  within(screen.getByTestId('run-status')).getByTestId('status-badge').textContent;

it('RF-230 the header badge of a run that read 16% says "Partly read: 16% of your code"', async () => {
  await openEnded({ extra: covered(0.16) });

  await waitFor(() => {
    expect(badge()).toBe('Partly read: 16% of your code');
  });
});

it('RF-230 P8-130 the header badge of a run that stopped at its cap says the share too, as its History row does', async () => {
  // The summary answers after `run.ended` (RST-1600) reached the page, as it does on a real capped run.
  let release = (): void => undefined;
  const ended = new Promise<void>((resolve) => {
    release = resolve;
  });
  const late = () => ended.then(() => understanding(measures({ firstPartyCoverage: 0.16 })));
  await openEnded({
    endState: 'CapReached',
    extra: { ...coverage(0.16), [understandingPath]: late },
  });
  await screen.findByTestId('run-failure');
  release();

  await waitFor(() => {
    expect(badge()).toBe('Partly read: 16% of your code');
  });
});

it('RF-230 the header badge says only "Partly read" until the first-party coverage of the run is known', async () => {
  await openEnded({ extra: coverage(0.16) });

  await waitFor(() => {
    expect(badge()).toBe('Partly read');
  });
});

it('RF-230 a run that read every area above the bar keeps its Completed badge', async () => {
  await openEnded({ extra: covered(0.95) });

  await waitFor(() => {
    expect(areasFact()).toContain('all read');
  });
  expect(badge()).toBe('Completed');
});

it('RF-230 the Areas figure counts the area read below the bar as partly read, not as read', async () => {
  await openEnded({ extra: coverage(0.16) });

  await waitFor(() => {
    expect(areasFact()).toContain('1 partly read');
  });
  expect(areasFact()).not.toContain('all read');
});

it('RF-230 the code map draws the area read at 16% as partly read (16%), with the legend naming it', async () => {
  await openEnded({ extra: coverage(0.16) });

  const panel = openTab('Evidence');

  await waitFor(() => {
    const tile = within(panel).getByRole('button', { name: /^Catalog/u });
    expect(tile.textContent).toContain('partly read (16%)');
    expect(tile.textContent).not.toMatch(/(^|\s)read ·/u);
  });
  expect(within(panel).getByRole('list', { name: 'Legend' }).textContent).toContain('partly read');
});

it('RF-230 the code map keeps an area above the bar as read', async () => {
  await openEnded({ extra: coverage(0.9) });

  const panel = openTab('Evidence');

  await waitFor(() => {
    expect(within(panel).getByRole('button', { name: /^Catalog/u }).textContent).toContain(
      'read ·',
    );
  });
});

it('RF-230 the Areas figure does not say "all read" while the coverage is being read', async () => {
  await openEnded({ extra: { [coveragePath]: () => new Promise<Response>(() => undefined) } });

  expect(areasFact()).toContain('checking coverage');
  expect(areasFact()).not.toContain('all read');
});

it('RF-230 the Areas figure does not say "all read" when the coverage cannot be read', async () => {
  await openEnded({ extra: { [coveragePath]: failure(500, 'RST-1000') } });

  await waitFor(() => {
    expect(areasFact()).toContain('coverage not known');
  });
  expect(areasFact()).not.toContain('all read');
});

it('RF-230 the Areas figure does not say "all read" for a coverage written before the shares existed', async () => {
  await openEnded({ extra: coverage() });

  await waitFor(() => {
    expect(areasFact()).toContain('coverage not known');
  });
  expect(areasFact()).not.toContain('all read');
});
