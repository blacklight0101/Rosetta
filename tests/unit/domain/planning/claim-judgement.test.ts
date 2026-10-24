import { describe, expect, it } from 'vitest';
import {
  assembleJudgements,
  settleJudgements,
  type DraftClaimJudgement,
} from '../../../../src/domain/planning/claim-judgement.js';

// RF-631, P5-41, DEC-11: the planner's judgement of a claim (it is changed by a decision or an
// answer, or it states a likely defect) is checked by code: the claim's card must be a supported
// card, a decision must exist, and a change that names neither a decision nor an answer is a defect
// to decide, never a silent change.

const supported = new Set(['FEAT-001', 'BR-002', 'OQ-003']);

function draft(overrides: Partial<DraftClaimJudgement> = {}): DraftClaimJudgement {
  return {
    ...{ claim: 'FEAT-001.c1', judgement: 'change', decision: 1, answer: null },
    ...{ reason: 'An ADR hashes it.', security: false },
    ...overrides,
  };
}

describe('assembleJudgements', () => {
  it('RF-631 a change that names an existing decision keeps that decision as its ADR id', () => {
    const [judged] = assembleJudgements([draft({ decision: 2 })], supported, 3);

    expect(judged).toMatchObject({ claimId: 'FEAT-001.c1', kind: 'change', decisionId: 'ADR-002' });
  });

  it('RF-631 a change that names a decision which does not exist is a defect to decide', () => {
    const [judged] = assembleJudgements([draft({ decision: 4 })], supported, 3);

    expect(judged?.kind).toBe('defect');
    expect(judged?.decisionId).toBeUndefined();
  });

  it('RF-631 a change that names no decision and no answer is a defect to decide', () => {
    const [judged] = assembleJudgements([draft({ decision: null })], supported, 3);

    expect(judged?.kind).toBe('defect');
  });

  it('RF-631 a change that names an answer keeps the card of the question', () => {
    const [judged] = assembleJudgements(
      [draft({ decision: null, answer: 'OQ-003' })],
      supported,
      0,
    );

    expect(judged).toMatchObject({ kind: 'change', answerCard: 'OQ-003' });
  });

  it('RF-631 a defect keeps its reason and its security mark, and names no decision', () => {
    const [judged] = assembleJudgements(
      [draft({ judgement: 'defect', decision: 1, security: true })],
      supported,
      3,
    );

    expect(judged).toMatchObject({ kind: 'defect', security: true, reason: 'An ADR hashes it.' });
    expect(judged?.decisionId).toBeUndefined();
  });
});

describe('assembleJudgements, the other cases', () => {
  it('ADR-013 a judgement of a claim whose card is not a supported card is left out', () => {
    expect(assembleJudgements([draft({ claim: 'FEAT-099.c1' })], supported, 3)).toEqual([]);
    expect(assembleJudgements([draft({ claim: 'no card at all' })], supported, 3)).toEqual([]);
  });

  it('RF-631 a claim is judged once: the first judgement stands', () => {
    const judged = assembleJudgements(
      [draft({ judgement: 'defect' }), draft({ judgement: 'change' })],
      supported,
      3,
    );

    expect(judged.map((each) => each.kind)).toEqual(['defect']);
  });
});

describe('settleJudgements', () => {
  const changedByAnswer = assembleJudgements(
    [draft({ decision: null, answer: 'OQ-003' })],
    supported,
    0,
  );

  it('RF-631 a change by an answer stays a change when the question was answered', () => {
    const settled = settleJudgements(changedByAnswer, new Set(['OQ-003']));

    expect(settled[0]?.kind).toBe('change');
  });

  it('RF-631 a change by an answer nobody gave is a defect to decide', () => {
    const settled = settleJudgements(changedByAnswer, new Set());

    expect(settled[0]?.kind).toBe('defect');
    expect(settled[0]?.answerCard).toBeUndefined();
  });

  it('RF-631 a change by a decision is not affected by the answers', () => {
    const byDecision = assembleJudgements([draft()], supported, 3);

    expect(settleJudgements(byDecision, new Set())[0]?.kind).toBe('change');
  });
});
