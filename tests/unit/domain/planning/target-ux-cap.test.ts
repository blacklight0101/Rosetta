import { describe, expect, it } from 'vitest';
import { assembleUx } from '../../../../src/domain/planning/target-ux-assembly.js';
import { MAX_SCREENS } from '../../../../src/domain/planning/target-ux.js';
import { screenCard, shopDraft, shopScreens } from '../../../support/ux-fixtures.js';

// RF-626, RF-627, Q-27, P5-40: a legacy screen dropped only because of the cap on screens is marked,
// so checks.md can list the Must screens the cap lost.

describe('assembleUx: a screen lost to the cap is marked', () => {
  it('RF-626 P5-40 only a screen over the cap carries the overCap mark', () => {
    const cards = Array.from({ length: MAX_SCREENS + 1 }, (_, index) =>
      screenCard(`SCRN-${String(index + 1).padStart(3, '0')}`, {
        title: 'S',
        route: `/s${String(index)}`,
      }),
    );
    const screens = cards.map((card) => ({
      name: card.id,
      purpose: '',
      reason: 'M.',
      cards: [card.id],
    }));

    const { ux } = assembleUx({ ...shopDraft(), dropped: [], screens }, cards);

    expect(ux.legacy.filter((each) => each.overCap === true).map((each) => each.cardId)).toEqual([
      'SCRN-021',
    ]);
  });
});

describe('assembleUx: a screen the planner dropped is not a cap loss', () => {
  it('RF-626 P5-40 a dropped screen carries no overCap mark', () => {
    const { ux } = assembleUx(shopDraft(), shopScreens());

    expect(ux.legacy.filter((each) => each.disposition === 'dropped')).not.toHaveLength(0);
    expect(ux.legacy.some((each) => each.overCap === true)).toBe(false);
  });
});
