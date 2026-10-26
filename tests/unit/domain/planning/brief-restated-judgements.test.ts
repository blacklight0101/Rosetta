import { describe, expect, it } from 'vitest';
import { decideOnce } from '../../../../src/domain/planning/brief-restated.js';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import type { DraftDecision } from '../../../../src/domain/planning/plan-draft.js';
import { buildBrief } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// P5-41, RF-631: a judgement that names a decision follows it when decisions are left out or renumbered.

const supported = new Set(['FEAT-001', 'BR-001']);
const layered = { architecture: { style: 'layered' } } as const;

function decision(title: string, text = 'It is decided.', sources: string[] = []): DraftDecision {
  return { title, context: 'Context.', decision: text, consequences: 'Consequences.', sources };
}

describe('decideOnce: the judgements of claims', () => {
  it('P5-41 RF-631 a judgement follows its decision to the new id when an earlier decision is left out', () => {
    const brief = { ...buildBrief(layered, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
    const content = assemblePlan(
      {
        ...{ summary: 'A shop.', requirements: [], components: [], entities: [], phases: [] },
        ...{ tasks: [], risks: [] },
        decisions: [
          decision('Adopt layered architecture'),
          decision('Hash passwords', 'Passwords are hashed.', ['BR-001']),
        ],
        technical: { integrations: [], security: [], targets: [], environments: [] },
        claimJudgements: [
          {
            ...{ claim: 'BR-001.c1', judgement: 'change', decision: 2, answer: null },
            ...{ reason: 'Hashed.', security: true },
          },
        ],
      },
      supported,
    ).content;

    const decidedContent = decideOnce(content, brief, shippedCatalogue, {
      supported,
      cards: [],
    }).content;

    expect(decidedContent.decisions[0]?.title).toBe('Hash passwords');
    expect(decidedContent.judgements?.[0]?.decisionId).toBe('ADR-001');
  });
});
