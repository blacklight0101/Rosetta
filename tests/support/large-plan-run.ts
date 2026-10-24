import type { Card } from '../../src/domain/cards/card.js';
import { base, claim, judgedCard } from './plan-cards.js';

// P5-28: a large understand run for the plan setup tests: the cards of a real 450-card project in
// size, generated, with a fifth of them open questions.

const TYPES = ['FEAT', 'BR', 'INT', 'ENT', 'OQ'] as const;

/** `count` cards of mixed types, one supported claim each; ids run from 001 per type. */
export function manyCards(count: number): readonly Card[] {
  const perType = new Map<string, number>();
  return Array.from({ length: count }, (_item, index) => {
    const type = TYPES[index % TYPES.length] ?? 'BR';
    const next = (perType.get(type) ?? 0) + 1;
    perType.set(type, next);
    const id = `${type}-${String(next).padStart(3, '0')}`;
    return judgedCard(
      {
        ...base(id, type, `Card number ${String(index)}`),
        ...(type === 'OQ'
          ? { question: `Question ${String(index)}?`, whyItMatters: 'The rule must be kept.' }
          : {}),
        claims: [
          claim(`Claim of card ${String(index)} ${'x'.repeat(80)}.`, `src/A/F${String(index)}.cs`),
        ],
      },
      ['Supported'],
    );
  });
}

/** Whether a path of a run folder is a card file (not the index). */
export const isCardFile = (path: string): boolean =>
  /\/cards\/(FEAT|BR|INT|ENT|OQ)\/[A-Z]+-\d+\.md$/u.test(path);
