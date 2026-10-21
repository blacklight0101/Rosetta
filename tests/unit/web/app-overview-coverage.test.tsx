import { cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { notCoveredOf } from '../../../src/domain/overview/standing.js';
import { json } from './fake-api.js';
import { renderLive, runPath, runRow } from './live-run-helpers.js';

// RF-264, P1-173: "What was not covered" groups its lines by reason with a count per group, and a
// long group is folded behind a disclosure that lists the areas.

const base = { thirdParty: false, selected: true, ended: true, cards: 2 };
const names = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(index)}`);

const lines = notCoveredOf([
  ...names('Own', 30).map((name) => ({ ...base, name, selected: false })),
  ...names('Vendor', 8).map((name) => ({ ...base, name, thirdParty: true })),
  { ...base, name: 'Orders', cards: 0, failure: 'the model did not answer' },
]);

const full = { state: 'full', sections: [], notCovered: lines, questions: [] };

async function coverage(): Promise<HTMLElement> {
  renderLive({
    [`GET ${runPath}`]: runRow({ queueState: 'Ended', endState: 'Completed' }),
    [`GET ${runPath}/overview`]: json(200, { overview: full }),
    [`GET ${runPath}/answers`]: json(200, { questions: [] }),
  });
  return screen.findByRole('region', { name: 'What was not covered' });
}

describe('the list of what was not covered', () => {
  it('RF-264 groups the lines by reason with a count per group', async () => {
    const region = await coverage();

    expect(within(region).getByText('Not selected for this run (30)')).toBeTruthy();
    expect(within(region).getByText('Third-party code (8)')).toBeTruthy();
    expect(within(region).getByText('Its reader could not finish (1)')).toBeTruthy();
  });

  it('RF-264 folds a long group behind a disclosure that lists the areas', async () => {
    const region = await coverage();

    const summary = within(region).getByText('Not selected for this run (30)');
    const folded = summary.closest('details');
    if (folded === null) throw new Error('The long group is not folded.');

    expect(folded.open).toBe(false);
    expect(within(folded).getAllByRole('listitem')).toHaveLength(30);
    expect(within(folded).getByText('Own29')).toBeTruthy();
    fireEvent.click(summary);
    expect(folded.open).toBe(true);
  });

  it('RF-264 lists a short group in the open, with the detail of each line', async () => {
    const region = await coverage();

    expect(
      within(region).getByText('Its reader could not finish (1)').closest('details'),
    ).toBeNull();
    expect(region.textContent).toContain(
      'Orders: its reader could not finish (the model did not answer).',
    );
  });

  it('RF-264 does not repeat the reason on every line of a group', async () => {
    const region = await coverage();

    expect(region.textContent).not.toContain('Own3: not selected for this run.');
    expect(region.textContent).toContain('Own3');
  });
});

describe('the notice of a run of chosen areas', () => {
  it('RF-264 is shown as information, and the notice of a thin run stays a warning', async () => {
    const notice = 'Read 2 of 42 areas the scan found. Reading more areas gives a fuller picture.';
    const thin = 'This run cannot explain the application yet. Next step: run again.';
    const page = (overview: object): Promise<HTMLElement> => {
      renderLive({
        [`GET ${runPath}`]: runRow({ queueState: 'Ended', endState: 'Completed' }),
        [`GET ${runPath}/overview`]: json(200, { overview }),
        [`GET ${runPath}/answers`]: json(200, { questions: [] }),
      });
      return screen.findByTestId('overview-notice');
    };

    const shown = await page({ ...full, notice });

    expect(shown.textContent).toContain('2 of 42 areas');
    expect(shown.className).toContain('rst-callout--info');
    expect(shown.className).not.toContain('rst-callout--warn');
    cleanup();
    const warned = await page({ ...full, state: 'thin', notice: thin });
    expect(warned.className).toContain('rst-callout--warn');
  });
});

describe('the fold of a group', () => {
  const sized = (open: number, folded: number): readonly string[] =>
    notCoveredOf([
      ...names('Pick', open).map((name) => ({ ...base, name, selected: false })),
      ...names('Lib', folded).map((name) => ({ ...base, name, thirdParty: true })),
    ]);

  it('RF-264 keeps a group of exactly 5 lines open and folds one of exactly 6', async () => {
    renderLive({
      [`GET ${runPath}`]: runRow({ queueState: 'Ended', endState: 'Completed' }),
      [`GET ${runPath}/overview`]: json(200, {
        overview: { ...full, notCovered: sized(5, 6) },
      }),
      [`GET ${runPath}/answers`]: json(200, { questions: [] }),
    });
    const region = await screen.findByRole('region', { name: 'What was not covered' });

    expect(within(region).getByText('Not selected for this run (5)').closest('details')).toBeNull();
    expect(within(region).getByText('Third-party code (6)').closest('details')).not.toBeNull();
  });
});

describe('the files not read', () => {
  const unread = notCoveredOf(
    [{ ...base, name: 'Orders', cards: 0, failure: 'the model did not answer' }],
    {
      files: Array.from({ length: 41 }, (_, index) => ({
        path: `src/F${String(index)}.cs`,
        tokens: 99 - index,
      })),
      firstPartyTokens: 5000,
      firstPartyReadTokens: 100,
    },
  );

  async function unreadRegion(): Promise<HTMLElement> {
    renderLive({
      [`GET ${runPath}`]: runRow({ queueState: 'Ended', endState: 'Completed' }),
      [`GET ${runPath}/overview`]: json(200, {
        overview: { ...full, notCovered: unread },
      }),
      [`GET ${runPath}/answers`]: json(200, { questions: [] }),
    });
    return screen.findByRole('region', { name: 'What was not covered' });
  }

  it('RF-264 shows the count, the share, the largest files and the Deepen step, not the old sentence', async () => {
    const region = await unreadRegion();

    expect(region.textContent).toContain(
      'First-party files not read: 41 files, 98% of first-party tokens not read.',
    );
    expect(region.textContent).toContain('Largest: src/F0.cs (99 tokens)');
    expect(region.textContent).toContain('Next step: run a Deepen to read them.');
    expect(region.textContent).not.toContain('Every area of the run gave at least one card.');
  });

  it('RF-264 keeps the failed-area group beside the files not read (P3-76)', async () => {
    const region = await unreadRegion();

    expect(within(region).getByText('Its reader could not finish (1)')).toBeTruthy();
    expect(region.textContent).toContain('Orders: its reader could not finish');
  });
});

describe('nothing left out', () => {
  it('RF-264 says every area gave a card when nothing is left out', async () => {
    renderLive({
      [`GET ${runPath}`]: runRow({ queueState: 'Ended', endState: 'Completed' }),
      [`GET ${runPath}/overview`]: json(200, { overview: { ...full, notCovered: [] } }),
      [`GET ${runPath}/answers`]: json(200, { questions: [] }),
    });

    const region = await screen.findByRole('region', { name: 'What was not covered' });

    expect(region.textContent).toContain('Every area of the run gave at least one card.');
  });
});
