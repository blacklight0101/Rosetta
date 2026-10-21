import { describe, expect, it } from 'vitest';
import { writeOverview } from '../../../../src/application/overview/write-overview.js';
import type { AreaStanding } from '../../../../src/domain/overview/standing.js';
import { goodOverviewAnswer, overviewCards } from '../../../support/app-overview-fixtures.js';
import { answer, Answers, partsOf, standing } from '../../../support/overview-step-harness.js';

// RF-264, P1-173: a run the owner limited to some areas says how many areas it read out of how many
// the scan found; it is thin only when its cards are too few for the areas that were chosen.

const others = (count: number, overrides: Partial<AreaStanding>): AreaStanding[] =>
  Array.from({ length: count }, (_, index) => standing(`Other${String(index)}`, overrides));

const chosen = [
  standing('Orders'),
  standing('Billing'),
  ...others(20, { thirdParty: true, selected: false }),
  ...others(20, { selected: false }),
];

describe('writeOverview on a run of chosen areas', () => {
  it('RF-264 says how many areas were read out of how many were found, not that it cannot explain', async () => {
    const { parts } = partsOf(new Answers(() => answer(goodOverviewAnswer)));

    const overview = await writeOverview(parts, { cards: overviewCards(), areas: chosen });

    expect(overview.state).toBe('full');
    expect(overview.notice).toContain('2 of 42 areas');
    expect(overview.notice).toContain('fuller picture');
    expect(overview.notice).not.toContain('cannot explain');
    expect(overview.notice).not.toContain('third-party');
    expect(overview.sections.length).toBeGreaterThan(0);
  });

  it('RF-264 chosen areas with too few cards still say the run cannot explain the application', async () => {
    const provider = new Answers(() => answer(goodOverviewAnswer));
    const { parts } = partsOf(provider);
    const cards = overviewCards().filter((card) => card.id === 'FEAT-001');

    const overview = await writeOverview(parts, { cards, areas: chosen });

    expect(provider.requests).toHaveLength(0);
    expect(overview.state).toBe('thin');
    expect(overview.notice).toContain('cannot explain the application yet');
    expect(overview.notice).toContain('Only 1 card from 1 of 2 areas passed the citation check.');
    expect(overview.notice).not.toContain('third-party');
  });

  it('RF-264 a run that chose and read every area of its own code gives no notice', async () => {
    const { parts } = partsOf(new Answers(() => answer(goodOverviewAnswer)));
    const all = [standing('Orders'), standing('Billing')];

    const overview = await writeOverview(parts, { cards: overviewCards(), areas: all });

    expect(overview.state).toBe('full');
    expect(overview.notice).toBeUndefined();
  });
});

describe('writeOverview and the areas that count as chosen', () => {
  it('RF-264 a selected third-party area does not count as a chosen one', async () => {
    const { parts } = partsOf(new Answers(() => answer(goodOverviewAnswer)));
    const mixed = [
      standing('Orders'),
      standing('Vendor', { thirdParty: true }),
      standing('Docs', { selected: false }),
    ];

    const overview = await writeOverview(parts, { cards: overviewCards(), areas: mixed });

    expect(overview.notice).toContain('1 of 3 areas');
  });

  it('RF-264 asking for third-party areas only is not a run of chosen areas', async () => {
    const { parts } = partsOf(new Answers(() => answer(goodOverviewAnswer)));
    const vendor = [
      standing('Vendor', { thirdParty: true }),
      standing('Orders', { selected: false }),
      standing('Billing', { selected: false }),
    ];

    const overview = await writeOverview(parts, { cards: overviewCards(), areas: vendor });

    expect(overview.notice ?? '').not.toContain('fuller picture');
  });
});
