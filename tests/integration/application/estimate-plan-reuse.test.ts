import { describe, expect, it, vi } from 'vitest';
import type { DataBlock } from '../../../src/domain/egress/data-block.js';
import { createPlanEstimateHarness } from '../../support/plan-estimate-harness.js';
import { base, claim, judgedCard } from '../../support/plan-cards.js';

// RF-613, P3-113, RF-1105 (P5-22): the plan estimate reads each card file once and renders the big
// cards block of the planner calls once, so the plan setup page of a large run loads fast. Both are
// counted, not timed.

const rendered: DataBlock[] = [];

vi.mock('../../../src/domain/egress/data-block.js', async (original) => {
  const module = await original<{ renderDataBlock: (block: DataBlock, tag: string) => string }>();
  return {
    ...module,
    renderDataBlock: (block: DataBlock, tag: string) => {
      rendered.push(block);
      return module.renderDataBlock(block, tag);
    },
  };
});

function manyCards(count: number) {
  const types = ['FEAT', 'BR', 'INT'] as const;
  return Array.from({ length: count }, (_item, index) => {
    const type = types[index % types.length] ?? 'BR';
    const id = `${type}-${String(index + 1).padStart(3, '0')}`;
    return judgedCard(
      {
        ...base(id, type, `Card number ${String(index)}`),
        claims: [
          claim(`Claim of card ${String(index)} ${'x'.repeat(80)}.`, `src/A/F${String(index)}.cs`),
        ],
      },
      ['Supported'],
    );
  });
}

describe('EstimatePlan reuses what it reads', () => {
  it('RF-613 reads each card file of the source run once', async () => {
    const harness = await createPlanEstimateHarness({ seed: { cards: manyCards(60) } });
    harness.files.reads.length = 0;

    const outcome = await harness.estimate.execute({
      actor: harness.actor,
      projectId: harness.project.id,
    });

    expect(outcome.ok).toBe(true);
    const cardReads = harness.files.reads.filter((path) =>
      /\/cards\/(FEAT|BR|INT)\/.*\.md$/u.test(path),
    );
    expect(cardReads).toHaveLength(60);
    expect(new Set(cardReads).size).toBe(60);
  });

  it('P3-113 renders the cards block that the plan and the PRD calls share once', async () => {
    const harness = await createPlanEstimateHarness({ seed: { cards: manyCards(80) } });
    rendered.length = 0;

    const outcome = await harness.estimate.execute({
      actor: harness.actor,
      projectId: harness.project.id,
    });

    expect(outcome.ok).toBe(true);
    // The plan and the PRD send the same cards; the longest block is theirs.
    const cardBlocks = rendered.filter((block) => block.source === 'cards');
    const longest = Math.max(...cardBlocks.map((block) => block.text.length));
    expect(longest).toBeGreaterThan(5000);
    expect(cardBlocks.filter((block) => block.text.length === longest)).toHaveLength(1);
  });
});
