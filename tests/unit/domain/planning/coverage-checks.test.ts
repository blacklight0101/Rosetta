import { describe, expect, it } from 'vitest';
import {
  mustScreensOverCap,
  requirementsBuiltByNoCard,
  sourceCardsWithNoRequirement,
} from '../../../../src/domain/planning/coverage-checks.js';
import { emptyPrd } from '../../../../src/domain/planning/prd-content.js';
import type { LegacyScreen } from '../../../../src/domain/planning/target-ux.js';
import { planOf } from '../../../support/coverage-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';
import { screenCard } from '../../../support/ux-fixtures.js';

// RF-627, P5-40: the checks that count what the package claims. A requirement no card lists, a Must
// screen dropped over the screen cap and a source feature that reaches no requirement are listed.

describe('requirementsBuiltByNoCard', () => {
  it('RF-627 P5-40 lists a requirement that no task card lists, in the order of the plan', () => {
    const plan = planOf([planTask({ id: 'T-001', requirements: ['REQ-001'] })]);

    expect(requirementsBuiltByNoCard(plan).map((each) => each.id)).toEqual(['REQ-002']);
  });

  it('RF-627 P5-40 lists nothing when every requirement is on a card', () => {
    const plan = planOf([planTask({ id: 'T-001', requirements: ['REQ-001', 'REQ-002'] })]);

    expect(requirementsBuiltByNoCard(plan)).toEqual([]);
  });

  it('RF-627 P5-40 lists every requirement of a plan with no card', () => {
    expect(requirementsBuiltByNoCard(planOf([])).map((each) => each.id)).toEqual([
      'REQ-001',
      'REQ-002',
    ]);
  });
});

function legacy(cardId: string, overCap: boolean): LegacyScreen {
  return {
    ...{ cardId, title: cardId, route: `/${cardId}`, disposition: 'dropped', target: null },
    reason: 'Dropped.',
    ...(overCap ? { overCap: true } : {}),
  };
}

describe('mustScreensOverCap', () => {
  const prd = {
    ...emptyPrd,
    features: [
      { title: 'Pay', description: 'd', priority: 'Must' as const, sources: ['FEAT-001'] },
      { title: 'Chat', description: 'd', priority: 'Could' as const, sources: ['FEAT-002'] },
    ],
  };
  const requirements = [
    { id: 'REQ-001', title: 'Pay', statement: 's', sources: ['FEAT-001', 'SCRN-021'] },
    { id: 'REQ-002', title: 'Chat', statement: 's', sources: ['FEAT-002', 'SCRN-022'] },
  ];

  it('RF-627 P5-40 lists a screen dropped over the cap that a requirement of a Must feature cites', () => {
    const screens = [legacy('SCRN-021', true), legacy('SCRN-022', true)];

    expect(mustScreensOverCap(screens, prd, requirements).map((each) => each.cardId)).toEqual([
      'SCRN-021',
    ]);
  });

  it('RF-627 P5-40 a screen the planner dropped with a reason is not a cap loss', () => {
    expect(mustScreensOverCap([legacy('SCRN-021', false)], prd, requirements)).toEqual([]);
  });
});

describe('sourceCardsWithNoRequirement', () => {
  it('RF-627 P5-40 lists a supported feature card that no requirement cites', () => {
    const cards = [
      { ...screenCard('FEAT-030', { title: 'Purge', route: '' }), type: 'FEAT' as const },
      { ...screenCard('FEAT-001', { title: 'Pay', route: '' }), type: 'FEAT' as const },
      screenCard('SCRN-001', { title: 'Home', route: '/' }),
    ];
    const requirements = [{ id: 'REQ-001', title: 'Pay', statement: 's', sources: ['FEAT-001'] }];

    expect(sourceCardsWithNoRequirement(cards, requirements).map((each) => each.id)).toEqual([
      'FEAT-030',
    ]);
  });
});
