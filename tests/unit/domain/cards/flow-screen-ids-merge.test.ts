import { describe, expect, it } from 'vitest';
import { assignCardIds } from '../../../../src/domain/cards/card-ids.js';
import { applyMerges, MERGEABLE_TYPES } from '../../../../src/domain/cards/card-merge.js';
import { flowDraft, screenDraft } from '../../../support/flow-screen-fixtures.js';

describe('FLOW and SCRN ids', () => {
  it('RF-203 numbers FLOW and SCRN cards from 001 each, in order of area and appearance', () => {
    const cards = assignCardIds([
      { agentTaskId: 'a', area: 'orders', drafts: [flowDraft(), screenDraft(), flowDraft()] },
      { agentTaskId: 'b', area: 'catalog', drafts: [screenDraft()] },
    ]);

    expect(cards.ok && cards.value.map((card) => card.id)).toEqual([
      'FLOW-001',
      'SCRN-001',
      'FLOW-002',
      'SCRN-002',
    ]);
  });

  it('RF-203 a FLOW card without its flow detail gives no ids at all', () => {
    const { flow, ...bare } = flowDraft();

    const cards = assignCardIds([{ agentTaskId: 'a', area: 'orders', drafts: [bare] }]);

    expect(flow).toBeDefined();
    expect(cards).toEqual({ ok: false, error: 'flow-missing' });
  });
});

describe('FLOW and SCRN in consolidation', () => {
  it('RF-250 FLOW and SCRN are not mergeable types', () => {
    expect(MERGEABLE_TYPES).not.toContain('FLOW');
    expect(MERGEABLE_TYPES).not.toContain('SCRN');
  });

  it.each([
    ['FLOW', flowDraft],
    ['SCRN', screenDraft],
  ])('RF-250 two %s cards of two areas are not merged', (_type, make) => {
    const cards = assignCardIds([
      { agentTaskId: 'a', area: 'orders', drafts: [make()] },
      { agentTaskId: 'b', area: 'billing', drafts: [make()] },
    ]);
    const ids = cards.ok ? cards.value.map((card) => card.id) : [];

    const result = applyMerges(cards.ok ? cards.value : [], [{ ids, title: 'One', summary: 'x' }]);

    expect(result.applied).toEqual([]);
    expect(result.skipped.map((skip) => skip.problem)).toEqual(['type-not-mergeable']);
    expect(result.cards).toHaveLength(2);
  });
});
