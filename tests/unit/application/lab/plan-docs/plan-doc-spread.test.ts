import { describe, expect, it } from 'vitest';
import { capturePlanDocInput } from '../../../../../src/application/lab/capture/capture-plan-docs.js';
import type { TranscriptTask } from '../../../../../src/application/lab/capture/capture-types.js';
import { planMessage } from '../../../../../src/application/plan/plan-message.js';
import { buildBrief } from '../../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../../support/planning-brief-harness.js';
import { SequenceIdGenerator } from '../../../../support/sequence-id-generator.js';
import { feature } from './plan-doc-fixtures.js';

// RF-1404: the 8 cards of a plan case are taken in turns over the card types.

const ids = new SequenceIdGenerator();
const ownBrief = {
  ...buildBrief({ stack: [] }, shippedCatalogue),
  savedAt: '2026-10-12T09:30:00.000Z',
};
const taskOf = (user: string): TranscriptTask => ({
  name: 'planner-package',
  messages: [
    { role: 'system', content: 'The prompt of the run.' },
    { role: 'user', content: user },
  ],
});
const typed = (type: 'FEAT' | 'BR' | 'ENT', index: number) => ({
  ...feature,
  type,
  id: `${type}-${String(index)}`,
});

describe('the capture of the cards of a plan case', () => {
  it('RF-1404 spreads the 8 cards over the card types, in the order they came', () => {
    const many = (['FEAT', 'BR', 'ENT'] as const).flatMap((type) =>
      [1, 2, 3, 4, 5, 6].map((index) => typed(type, index)),
    );
    const text = planMessage(
      { cards: many, brief: ownBrief, catalogue: shippedCatalogue, answered: [] },
      () => ids.dataBlockTag(),
    );

    const captured = capturePlanDocInput('planner/package', taskOf(text)) as {
      cards: { id: string }[];
    };

    expect(captured.cards.map((each) => each.id)).toEqual([
      ...['FEAT-1', 'FEAT-2', 'FEAT-3'],
      ...['BR-1', 'BR-2', 'BR-3'],
      ...['ENT-1', 'ENT-2'],
    ]);
  });
});
