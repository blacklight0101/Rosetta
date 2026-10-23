import { describe, expect, it } from 'vitest';
import {
  omittedSummary,
  packCards,
  promptBudgetTokens,
  type PlanWindow,
} from '../../../../src/application/plan/plan-packing.js';
import { planMessage } from '../../../../src/application/plan/plan-message.js';
import { buildBrief } from '../../../../src/domain/planning/planning-brief.js';
import { largeSourceCards } from '../../../support/large-understand.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// P3-113, EV-29, RF-604: the cards of a large project are packed to the planner's window. Cards are
// grouped by area; the groups that fit are sent in full and the rest by id, type, title and area,
// worked out by code (no model call), so every supported card is still named in the prompt.

const TAG = 'a'.repeat(24);
const window131k: PlanWindow = { windowTokens: 131_072, maxOutputTokens: 16_384 };
const system = 'x'.repeat(30_000);
const brief = {
  ...buildBrief({ migration: 'parallel-change' }, shippedCatalogue),
  savedAt: '2026-10-12T09:30:00.000Z',
};
const tokensOf = (text: string): number => Math.ceil((system + text + '[]').length / 4);

const cards = largeSourceCards();
const render = (omitted: ReadonlySet<string>): string =>
  planMessage({ cards, brief, catalogue: shippedCatalogue, answered: [], omitted }, () => TAG);

describe('the large understand fixture', () => {
  it('P3-113 holds 371 supported cards that, unpacked, are larger than the 131,072-token window', () => {
    expect(cards).toHaveLength(371);
    expect(tokensOf(render(new Set()))).toBeGreaterThan(131_072);
  });
});

describe('packCards', () => {
  it('EV-29 sends everything when the prompt fits, byte for byte the unpacked message', () => {
    const roomy: PlanWindow = { windowTokens: 1_000_000, maxOutputTokens: 16_384 };

    const packed = packCards({ window: roomy, system, cards, render });

    expect(packed.omitted.size).toBe(0);
    expect(packed.fits).toBe(true);
    expect(render(packed.omitted)).toBe(render(new Set()));
  });

  it('EV-29 packs a prompt larger than the window below the budget, leaving room for the answer', () => {
    const packed = packCards({ window: window131k, system, cards, render });

    expect(packed.fits).toBe(true);
    expect(tokensOf(render(packed.omitted))).toBeLessThanOrEqual(promptBudgetTokens(window131k));
    // The answer and one continuation (the answer so far, then the next one) fit the window too.
    expect(tokensOf(render(packed.omitted)) + 2 * 16_384).toBeLessThanOrEqual(131_072);
    expect(packed.omitted.size).toBeGreaterThan(0);
    expect(packed.omitted.size).toBeLessThan(cards.length);
  });
});

describe('packCards by area', () => {
  it('EV-29 keeps whole areas together: an area is shown in full before another is cut', () => {
    const packed = packCards({ window: window131k, system, cards, render });

    const areas = new Map<string, { shown: number; omitted: number }>();
    for (const card of cards) {
      const entry = areas.get(card.area) ?? { shown: 0, omitted: 0 };
      if (packed.omitted.has(card.id)) entry.omitted += 1;
      else entry.shown += 1;
      areas.set(card.area, entry);
    }
    const split = [...areas.values()].filter((entry) => entry.shown > 0 && entry.omitted > 0);
    expect(split.length).toBeLessThanOrEqual(1);
  });

  it('EV-29 names every omitted card by id, type and title, so none leaves the package unseen', () => {
    const packed = packCards({ window: window131k, system, cards, render });
    const message = render(packed.omitted);

    for (const card of cards.filter((each) => packed.omitted.has(each.id))) {
      expect(message).toContain(card.id);
      expect(message).toContain(card.title);
    }
    expect(message).toContain(`${String(packed.omitted.size)} supported cards`);
  });

  it('EV-29 packs the same way every time', () => {
    const first = packCards({ window: window131k, system, cards, render });
    const second = packCards({ window: window131k, system, cards, render });

    expect([...second.omitted]).toEqual([...first.omitted]);
  });

  it('EV-29 says when even the cards by id cannot fit the window', () => {
    const tiny: PlanWindow = { windowTokens: 40_000, maxOutputTokens: 16_384 };

    const packed = packCards({ window: tiny, system, cards, render });

    expect(packed.fits).toBe(false);
    expect(packed.omitted.size).toBe(cards.length);
  });

  it('EV-29 packs nothing when the planner has no known window', () => {
    const packed = packCards({ window: undefined, system, cards, render });

    expect(packed.omitted.size).toBe(0);
    expect(packed.fits).toBe(true);
  });
});

describe('promptBudgetTokens', () => {
  it('EV-29 reserves the answer and the answer so far of one continuation, and a margin', () => {
    expect(promptBudgetTokens(window131k)).toBeLessThanOrEqual(131_072 - 2 * 16_384);
    expect(promptBudgetTokens(window131k)).toBeGreaterThan(131_072 - 2 * 16_384 - 6_000);
    expect(promptBudgetTokens({ windowTokens: 1_000, maxOutputTokens: 16_384 })).toBe(0);
  });
});

describe('omittedSummary', () => {
  it('EV-29 is empty when nothing is omitted', () => {
    expect(omittedSummary([])).toBe('');
  });

  it('EV-29 groups the omitted cards by area', () => {
    const some = cards
      .slice(0, 3)
      .map((card, index) => ({ ...card, area: `area-${String(index % 2)}` }));

    const text = omittedSummary(some);

    expect(text).toContain('area-0');
    expect(text).toContain('area-1');
    for (const card of some) expect(text).toContain(card.id);
  });
});
