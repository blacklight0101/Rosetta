import { describe, expect, it } from 'vitest';
import { createCard } from '../../../../src/domain/cards/card.js';
import { draftOf } from '../../../support/card-fixtures.js';
import { flowDraft } from '../../../support/flow-screen-fixtures.js';

const ids = { id: 'FLOW-001', agentTaskId: 't' };
const cite = [{ path: 'src/a.cs', startLine: 1, endLine: 2 }];

describe('createCard for a FLOW card', () => {
  it('RF-260 keeps the trigger, the outcome, each step target and numbered branches', () => {
    const card = createCard({ ...flowDraft(), ...ids });

    expect(card.ok && card.value.flow).toEqual({
      trigger: 'The shopper presses Pay.',
      outcome: 'An order is stored and mailed.',
    });
    const step = card.ok ? card.value.claims[0] : undefined;
    expect(step?.target).toBe('ENT-002');
    expect(step?.branches?.map((branch) => [branch.number, branch.text])).toEqual([
      [1, 'A stock error shows the basket again.'],
      [2, 'A payment error ends the flow.'],
    ]);
  });

  it('RF-260 a flow without its trigger and outcome is refused', () => {
    const { flow, ...bare } = flowDraft();

    expect(flow).toBeDefined();
    expect(createCard({ ...bare, ...ids })).toEqual({ ok: false, error: 'flow-missing' });
  });

  it('RF-260 a step without a citation is refused', () => {
    const claims = [{ text: 'The order is saved.', citations: [], target: 'ENT-002' }];

    expect(createCard({ ...flowDraft({ claims }), ...ids })).toEqual({
      ok: false,
      error: 'claim-without-citation',
    });
  });

  it('RF-260 a branch without a citation is refused', () => {
    const branches = [{ text: 'A guess.', citations: [] }];
    const claims = [{ text: 'The order is saved.', citations: cite, branches }];

    expect(createCard({ ...flowDraft({ claims }), ...ids })).toEqual({
      ok: false,
      error: 'branch-without-citation',
    });
  });
});

describe('createCard on a card that is not a FLOW', () => {
  it('RF-260 a card that is not a FLOW carries no flow, target or branch', () => {
    const branches = [{ text: 'b', citations: cite }];
    const claims = [{ text: 'x', citations: cite, target: 'BR-001', branches }];

    const card = createCard({
      ...draftOf({ claims }),
      flow: flowDraft().flow,
      id: 'FEAT-001',
      agentTaskId: 't',
    });

    expect(card.ok && card.value.flow).toBeUndefined();
    expect(card.ok && card.value.claims[0]?.target).toBeUndefined();
    expect(card.ok && card.value.claims[0]?.branches).toBeUndefined();
  });
});
