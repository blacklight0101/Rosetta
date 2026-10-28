import { describe, expect, it } from 'vitest';
import type { BuildMethod } from '../../../../src/domain/planning/build-method.js';
import { markdownEscaper } from '../../../../src/infrastructure/cards/markdown-text.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardModelText } from '../../../../src/infrastructure/handoff/handoff-task-markdown.js';
import { modelCheckLine } from '../../../../src/infrastructure/handoff/handoff-model-checks-markdown.js';

// RF-641, DEC-185: a card on the escalation model shows "escalation, owner approved" on its card
// line and a note in checks.md; a card on a tier model shows neither. Hand-built input: the spec
// does not say how a card gets the escalation model.

const method: BuildMethod = {
  aiAssisted: true,
  agentTool: { kind: 'claude-code' },
  models: { smallest: 'haiku', middle: 'sonnet', largest: 'opus', escalation: 'fable' },
};
const esc = markdownEscaper(new SecretMasker());

describe('RF-641 DEC-185 the model on the card line', () => {
  it('RF-641 DEC-185 a card on the escalation model shows the owner approval', () => {
    expect(cardModelText(method, 'largest', esc, 'fable')).toBe(
      'largest tier, model: fable, escalation, owner approved',
    );
  });

  it('RF-641 DEC-185 a card on a tier model shows no approval text', () => {
    expect(cardModelText(method, 'middle', esc, 'sonnet')).toBe('middle tier, model: sonnet');
  });
});

describe('RF-641 DEC-185 the escalation note in checks.md', () => {
  it('RF-641 DEC-185 a note names the card and the owner approval', () => {
    const line = modelCheckLine({
      cardId: 'T-007',
      kind: 'escalation-owner-approval',
      severity: 'note',
    });
    expect(line).toBe('- T-007 (note): uses the escalation model, which needs the owner approval');
  });
});
