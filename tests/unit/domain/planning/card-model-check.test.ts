import { describe, expect, it } from 'vitest';
import type { BuildMethod } from '../../../../src/domain/planning/build-method.js';
import {
  checkCardModel,
  type CardModelFacts,
} from '../../../../src/domain/planning/card-model-check.js';

// RF-641, RF-635, RF-639, DEC-176 Q-D and Q-F: each way a card's model can be wrong is one finding
// with the card id; a clean card has none; a local model above difficulty 2 is a warning.

const method: BuildMethod = {
  aiAssisted: true,
  agentTool: { kind: 'claude-code' },
  models: { smallest: 'haiku', middle: 'sonnet', largest: 'opus', escalation: 'fable' },
};

const clean: CardModelFacts = {
  ...{ cardId: 'T-001', rating: 6, riskClass: 'none', riskShown: true, local: false },
  ...{ builderTier: 'middle', builderModel: 'sonnet' },
  ...{ verifierTier: 'middle', verifierModel: 'sonnet' },
};

const kindsOf = (facts: Partial<CardModelFacts>, given = method) =>
  checkCardModel(given, { ...clean, ...facts }).map((each) => each.kind);

describe('RF-641 the model check of one card', () => {
  it('RF-641 a clean card has no finding', () => {
    expect(checkCardModel(method, clean)).toEqual([]);
  });

  it('RF-641 lists a card whose model is not one of the tool models', () => {
    expect(kindsOf({ builderModel: 'gpt-x' })).toEqual(['model-not-in-brief']);
  });

  it('RF-641 accepts the escalation model of the brief as a model of the tool', () => {
    expect(kindsOf({ builderModel: 'fable' })).not.toContain('model-not-in-brief');
  });

  it('RF-641 DEC-185 lists a card on the escalation model as a note needing the owner approval', () => {
    expect(checkCardModel(method, { ...clean, builderModel: 'fable' })).toEqual([
      { cardId: 'T-001', kind: 'escalation-owner-approval', severity: 'note' },
    ]);
  });

  it('RF-641 DEC-185 a card on a tier model has no escalation note', () => {
    expect(kindsOf({ builderModel: 'opus' })).not.toContain('escalation-owner-approval');
  });

  it('RF-641 DEC-185 a brief with no escalation model gives no escalation note', () => {
    const none: BuildMethod = { ...method, models: { smallest: 'haiku', middle: 'sonnet' } };
    expect(kindsOf({ builderModel: 'haiku' }, none)).not.toContain('escalation-owner-approval');
  });

  it('RF-639 RF-641 lists a card whose tier has no model name', () => {
    expect(kindsOf({ builderModel: undefined })).toEqual(['tier-unnamed']);
  });

  it('RF-641 lists a card whose tier is lower than its band', () => {
    expect(kindsOf({ builderTier: 'smallest', builderModel: 'haiku' })).toEqual([
      'tier-below-band',
    ]);
  });

  it('RF-635 RF-641 lists a risk class card whose tier is lower than the middle one', () => {
    const risky = { riskClass: 'data loss', rating: 4 } as const;
    expect(kindsOf({ ...risky, builderTier: 'smallest', builderModel: 'haiku' })).toContain(
      'risk-tier-below-middle',
    );
  });

  it('RF-635 RF-641 lists a risk class card whose verifier is lower than the strongest', () => {
    expect(kindsOf({ riskClass: 'data loss', rating: 4 })).toEqual(['risk-verifier-below-largest']);
  });
});

describe('RF-641 the verifier, the risk class and the warning of one card', () => {
  it('RF-641 lists a card whose verifier is of a lower tier than its builder', () => {
    const facts = { rating: 9, builderTier: 'largest', builderModel: 'opus' } as const;
    expect(kindsOf(facts)).toEqual(['verifier-below-builder']);
  });

  it('RF-641 lists a card whose risk class is not shown next to its difficulty', () => {
    expect(kindsOf({ riskShown: false })).toEqual(['risk-not-shown']);
  });

  it('RF-641 Q-F a local model on a card above difficulty 2 is a warning, not a finding', () => {
    const found = checkCardModel(method, { ...clean, local: true });
    expect(found.map((each) => [each.kind, each.severity])).toEqual([['local-model', 'warning']]);
  });

  it('RF-641 Q-F a local model on a card of difficulty 2 or less has no warning', () => {
    const facts = {
      rating: 2,
      builderTier: 'smallest',
      builderModel: 'haiku',
      local: true,
    } as const;
    expect(kindsOf(facts)).toEqual([]);
  });

  it('RF-641 Q-D a finding is not a warning', () => {
    const found = checkCardModel(method, { ...clean, riskShown: false });
    expect(found.map((each) => each.severity)).toEqual(['finding']);
  });
});
