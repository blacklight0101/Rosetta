import { describe, expect, it } from 'vitest';
import {
  formatShare,
  summariseVerification,
  type CardClaimCounts,
} from '../../../../src/domain/cards/verification-summary.js';

// RF-303, ADR-005: "Given a verified run, when it ends, then the summary shows claims per status
// per area and the overall supported share."

function card(area: string, counts: Record<string, number>): CardClaimCounts {
  return { area, counts };
}

const run: readonly CardClaimCounts[] = [
  card('orders', { Supported: 2, Rejected: 1 }),
  card('catalog', { Supported: 1, Unverified: 1 }),
  card('orders', { Supported: 1, CitationInvalid: 1 }),
];

describe('summariseVerification', () => {
  it('RF-303 counts the claims per status for each area, areas in order of appearance', () => {
    const summary = summariseVerification(run);

    expect(summary.areas.map((area) => area.area)).toEqual(['orders', 'catalog']);
    expect(summary.areas[0]?.counts).toEqual({
      Proposed: 0,
      CitationInvalid: 1,
      Supported: 3,
      Rejected: 1,
      Unverified: 0,
    });
    expect(summary.areas[1]?.counts).toEqual({
      Proposed: 0,
      CitationInvalid: 0,
      Supported: 1,
      Rejected: 0,
      Unverified: 1,
    });
  });

  it('RF-303 gives each area its total and its supported share', () => {
    const [orders, catalog] = summariseVerification(run).areas;

    expect(orders).toMatchObject({ total: 5, supportedShare: 0.6 });
    expect(catalog).toMatchObject({ total: 2, supportedShare: 0.5 });
  });

  it('RF-303 gives the overall supported share over every claim of every status', () => {
    const { overall } = summariseVerification(run);

    expect(overall.total).toBe(7);
    expect(overall.counts.Supported).toBe(4);
    expect(overall.supportedShare).toBeCloseTo(4 / 7, 10);
  });
});

describe('summariseVerification edge cases', () => {
  it('RF-303 counts claims that are not Supported in the share, so rejected ones are not hidden', () => {
    const { overall } = summariseVerification([card('a', { Supported: 1, Rejected: 3 })]);

    expect(overall.supportedShare).toBe(0.25);
    expect(overall.counts.Rejected).toBe(3);
  });

  it('RF-303 has no share for a run or an area without claims', () => {
    const empty = summariseVerification([card('a', {}), card('b', { Supported: 1 })]);

    expect(empty.areas[0]).toMatchObject({ total: 0, supportedShare: null });
    expect(summariseVerification([]).overall).toMatchObject({ total: 0, supportedShare: null });
  });

  it('RF-303 ignores a status the vocabulary does not know', () => {
    const { overall } = summariseVerification([card('a', { Supported: 1, Mystery: 5 })]);

    expect(overall.total).toBe(1);
  });
});

describe('formatShare', () => {
  it('RF-303 writes a percentage with one decimal, or n/a without claims', () => {
    expect(formatShare(0.6)).toBe('60.0%');
    expect(formatShare(4 / 7)).toBe('57.1%');
    expect(formatShare(1)).toBe('100.0%');
    expect(formatShare(null)).toBe('n/a');
  });
});
