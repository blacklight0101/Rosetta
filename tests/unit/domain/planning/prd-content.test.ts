import { describe, expect, it } from 'vitest';
import type { CardType } from '../../../../src/domain/cards/card-vocabulary.js';
import {
  assemblePrd,
  emptyPrd,
  prdQuestions,
  type PrdContent,
} from '../../../../src/domain/planning/prd-content.js';

// RF-621, RF-602, DEC-80: the planner's PRD draft is untrusted. A statement keeps only the
// supported cards it names (a feature only FEAT cards, a rule only BR cards) and is dropped when
// none is left; a section the cards cannot fill becomes a question with a default.

const supported: ReadonlyMap<string, CardType> = new Map([
  ['FEAT-001', 'FEAT'],
  ['FEAT-003', 'FEAT'],
  ['BR-001', 'BR'],
  ['ENT-001', 'ENT'],
]);

function draft(overrides: Partial<PrdContent>): PrdContent {
  return { ...emptyPrd, ...overrides };
}

describe('assemblePrd', () => {
  it('RF-621 a feature keeps only its supported FEAT cards', () => {
    const { content } = assemblePrd(
      draft({
        features: [
          {
            ...{ title: 'Order', description: 'Place an order.', priority: 'Must' },
            sources: ['FEAT-001', 'BR-001', 'FEAT-002', 'FEAT-001'],
          },
        ],
      }),
      supported,
    );

    expect(content.features).toEqual([
      {
        ...{ title: 'Order', description: 'Place an order.', priority: 'Must' },
        sources: ['FEAT-001'],
      },
    ]);
  });
});

describe('assemblePrd: features and rules', () => {
  it('RF-621 a feature with no supported FEAT card is dropped and counted', () => {
    const { content, dropped } = assemblePrd(
      draft({
        features: [
          { title: 'Ship', description: 'Ship it.', priority: 'Should', sources: ['BR-001'] },
          { title: 'Export', description: 'Export.', priority: 'Could', sources: ['FEAT-002'] },
        ],
      }),
      supported,
    );

    expect(content.features).toEqual([]);
    expect(dropped).toBe(2);
  });

  it('RF-621 a rule keeps only its supported BR cards', () => {
    const { content, dropped } = assemblePrd(
      draft({
        rules: [
          { text: 'Orders over 50 ship free.', sources: ['BR-001', 'FEAT-001'] },
          { text: 'Made up.', sources: ['FEAT-001'] },
        ],
      }),
      supported,
    );

    expect(content.rules).toEqual([{ text: 'Orders over 50 ship free.', sources: ['BR-001'] }]);
    expect(dropped).toBe(1);
  });
});

describe('assemblePrd: the other sections', () => {
  it('RF-602 a role, an out-of-scope item and an expectation keep any supported card', () => {
    const { content } = assemblePrd(
      draft({
        roles: [{ name: 'Clerk', description: 'Cancels orders.', sources: ['ENT-001', 'XYZ-9'] }],
        outOfScope: [{ text: 'Exports.', sources: ['FEAT-003'] }],
        nonFunctional: [{ text: 'Fast.', sources: ['XYZ-9'] }],
      }),
      supported,
    );

    expect(content.roles[0]?.sources).toEqual(['ENT-001']);
    expect(content.outOfScope).toEqual([{ text: 'Exports.', sources: ['FEAT-003'] }]);
    expect(content.nonFunctional).toEqual([]);
  });

  it('RF-621 a problem or goal that names no supported card is not kept', () => {
    const { content, dropped } = assemblePrd(
      draft({
        problem: { text: 'It is slow.', sources: ['XYZ-9'] },
        goal: { text: 'Replace it.', sources: ['FEAT-001'] },
      }),
      supported,
    );

    expect(content.problem).toBeUndefined();
    expect(content.goal).toEqual({ text: 'Replace it.', sources: ['FEAT-001'] });
    expect(dropped).toBe(1);
  });
});

describe('prdQuestions', () => {
  it('RF-621 DEC-80 asks for the success measures and every section left empty, each with a default', () => {
    const questions = prdQuestions(emptyPrd);

    expect(questions.map((question) => question.id)).toEqual([
      'prd.problem',
      'prd.goal',
      'prd.roles',
      'prd.features',
      'prd.rules',
      'prd.out-of-scope',
      'prd.non-functional',
      'prd.success-measures',
    ]);
    for (const question of questions) {
      expect(question.question).not.toBe('');
      expect(question.answer).not.toBe('');
    }
  });

  it('RF-621 a section the cards filled raises no question; the success measures always do', () => {
    const full = draft({
      problem: { text: 'p', sources: ['FEAT-001'] },
      goal: { text: 'g', sources: ['FEAT-001'] },
      roles: [{ name: 'r', description: 'd', sources: ['FEAT-001'] }],
      features: [{ title: 't', description: 'd', priority: 'Must', sources: ['FEAT-001'] }],
      rules: [{ text: 'r', sources: ['BR-001'] }],
      outOfScope: [{ text: 'o', sources: ['FEAT-003'] }],
      nonFunctional: [{ text: 'n', sources: ['BR-001'] }],
    });

    expect(prdQuestions(full).map((question) => question.id)).toEqual(['prd.success-measures']);
  });
});
