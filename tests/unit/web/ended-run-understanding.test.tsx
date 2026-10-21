import { screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { failure } from './fake-api.js';
import { openEnded } from './ended-run-helpers.js';
import {
  deepenRecord,
  measures,
  understanding,
  understandingPath,
} from './understanding-fixtures.js';

// RF-231, RF-230, RF-209: the understanding measures on the page of an ended understand run: the
// first-party coverage by tokens, the files not read, the Supported share with its counts, the
// claims not judged, the rejected claims without a replacement, the third-party code apart; and,
// for a Deepen run, each measure before and after. Text and a glyph, never colour alone.

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = async (): Promise<HTMLElement> =>
  screen.findByRole('region', { name: 'Understanding measures' });

describe('RF-231 the measures beside the overview of an ended run', () => {
  it('RF-231 states the first-party coverage, the Supported share and what was not judged', async () => {
    await openEnded({ extra: { [understandingPath]: understanding(measures()) } });

    const panel = await summary();
    const row = (id: string): string => within(panel).getByTestId(`measure-${id}`).textContent;
    expect(row('coverage')).toContain('42%');
    expect(row('coverage')).toContain('12,000 of 28,362 first-party tokens');
    expect(row('share')).toContain('68 of 118');
    expect(row('notJudged')).toContain('3');
    expect(row('unresolved')).toContain('41');
    expect(row('notRead')).toContain('12');
  });

  it('RF-231 shows the third-party and generated code apart, in no percentage', async () => {
    await openEnded({ extra: { [understandingPath]: understanding(measures()) } });

    const apart = within(await summary()).getByTestId('measure-thirdParty').textContent;
    expect(apart).toContain('4 files');
    expect(apart).toContain('left out of every percentage');
  });

  it('RF-231 lists the largest first-party files not read, as text', async () => {
    await openEnded({ extra: { [understandingPath]: understanding(measures()) } });

    const list = within(await summary()).getByRole('list', { name: 'Largest files not read' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((each) => each.textContent),
    ).toEqual([
      expect.stringContaining('Orders/OrderService.cs'),
      expect.stringContaining('Catalog/Search.cs'),
    ]);
    expect(within(await summary()).getByText(/10 more/u)).toBeTruthy();
  });
});

describe('RF-231 the standing of a run', () => {
  it('RF-231 does not say well covered, and says why not, for a run below the bar', async () => {
    await openEnded({ extra: { [understandingPath]: understanding(measures()) } });

    const standing = within(await summary()).getByTestId('understanding-standing');
    expect(standing.textContent).toContain('Not covered enough to say more');
    expect(standing.textContent).not.toMatch(/well covered|complete/iu);
    expect(standing.querySelector('svg')).not.toBeNull();
  });

  it('RF-231 says well covered, with a check, only at 80% or more with nothing unjudged', async () => {
    const good = measures({ firstPartyCoverage: 0.83, notJudged: 0, wellCovered: true });
    await openEnded({ extra: { [understandingPath]: understanding(good) } });

    const standing = within(await summary()).getByTestId('understanding-standing');
    expect(standing.textContent).toContain('Well covered: 83% of first-party tokens read');
    expect(standing.querySelector('svg')).not.toBeNull();
  });
});

describe('RF-231 a run with nothing to measure', () => {
  it('RF-231 says so for a run without measures', async () => {
    await openEnded({ extra: { [understandingPath]: understanding(null) } });

    expect(await screen.findByText('This run has no measures to show.')).toBeTruthy();
  });

  it('RF-231 says the measures could not be read, and keeps the overview, when the read fails', async () => {
    await openEnded({ extra: { [understandingPath]: failure(500, 'RST-2006') } });

    expect(await screen.findByText('The measures of this run could not be read.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Overview of the application' })).toBeTruthy();
  });
});

describe('RF-231 the measures before and after a Deepen', () => {
  async function deepened(): Promise<HTMLElement> {
    const now = measures({ ...deepenRecord.after, filesNotReadCount: 7 });
    await openEnded({ extra: { [understandingPath]: understanding(now, deepenRecord) } });
    return summary();
  }

  it('RF-231 shows each measure before and after, with its change in words', async () => {
    const table = within(await deepened()).getByRole('table', {
      name: 'Before and after this Deepen',
    });

    const coverage = within(table).getByTestId('change-coverage').textContent;
    expect(coverage).toContain('42%');
    expect(coverage).toContain('55%');
    expect(coverage).toContain('better');
    expect(coverage).toContain('up 13 points');
  });

  it('RF-231 lists supported after a re-read apart, and names the run it improved', async () => {
    const panel = await deepened();

    expect(within(panel).getByTestId('change-afterReread').textContent).toContain('listed apart');
    const parent = within(panel).getByRole('link', { name: /20261001-090000-understand/u });
    expect(parent.getAttribute('href')).toBe('/runs/parent-uuid');
  });

  it('RF-209 words why the Deepen stopped and lists the claims it left out of scope', async () => {
    const panel = await deepened();

    expect(within(panel).getByTestId('deepen-stop').textContent).toContain(
      'No progress: the last round added no new supported claim',
    );
    expect(within(panel).getByTestId('deepen-out-of-scope').textContent).toContain(
      '2 rejected claims were left out of scope',
    );
  });
});

it('RF-231 reads the measures once for the page', async () => {
  const page = await openEnded({ extra: { [understandingPath]: understanding(measures()) } });

  await summary();
  await waitFor(() => {
    expect(page.calls.filter((call) => call.path.endsWith('/understanding'))).toHaveLength(1);
  });
});

describe('RF-231 the edges of the summary', () => {
  it('RF-231 lists no files not read when every first-party file was read', async () => {
    const all = measures({ filesNotReadCount: 0, filesNotRead: [] });
    await openEnded({ extra: { [understandingPath]: understanding(all) } });

    const panel = await summary();

    expect(within(panel).getByTestId('measure-notRead').textContent).toContain(
      'every first-party file was read',
    );
    expect(within(panel).queryByRole('list', { name: 'Largest files not read' })).toBeNull();
  });

  it('RF-231 shows no third-party row for a run with no third-party code', async () => {
    const none = measures({ thirdParty: { files: 0, tokens: 0, claims: 0 } });
    await openEnded({ extra: { [understandingPath]: understanding(none) } });

    expect(within(await summary()).queryByTestId('measure-thirdParty')).toBeNull();
  });

  it('RF-209 shows a Deepen that has not ended without a table, a stop or an out-of-scope list', async () => {
    const running = { ...deepenRecord, stopReason: null, after: null, outOfScope: [] };
    await openEnded({ extra: { [understandingPath]: understanding(measures(), running) } });

    const panel = await summary();

    expect(within(panel).queryByRole('table')).toBeNull();
    expect(within(panel).queryByTestId('deepen-stop')).toBeNull();
    expect(within(panel).queryByTestId('deepen-out-of-scope')).toBeNull();
  });

  it('RF-209 speaks of one claim left out of scope in the singular', async () => {
    const one = { ...deepenRecord, outOfScope: deepenRecord.outOfScope.slice(0, 1) };
    await openEnded({ extra: { [understandingPath]: understanding(measures(), one) } });

    expect(within(await summary()).getByTestId('deepen-out-of-scope').textContent).toContain(
      '1 rejected claim was left out of scope',
    );
  });
});

describe('RF-231 the summary of a run that did not complete', () => {
  it('RF-231 shows no measures for a run that failed, which has no overview either', async () => {
    await openEnded({
      extra: { [understandingPath]: understanding(measures()) },
      endState: 'Failed',
    });

    await screen.findByRole('region', { name: 'Your turn' });
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Understanding measures' })).toBeNull();
    });
    expect(screen.queryByRole('tab', { name: /^Overview/u })).toBeNull();
  });
});
