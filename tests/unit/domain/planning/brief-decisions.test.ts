import { describe, expect, it } from 'vitest';
import { briefDecisions } from '../../../../src/domain/planning/brief-decisions.js';
import { buildBrief, type BriefAnswers } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-608, RF-609, RF-610: the choices of the brief as decision records. The text comes from the
// brief and the catalogue; the evidence is only the cards that have a supported claim; a choice
// nobody made is proposed, not accepted.

const supported = new Set(['FEAT-001', 'BR-001']);

function decisionsFor(answers: BriefAnswers, after = 0): ReturnType<typeof briefDecisions> {
  const brief = { ...buildBrief(answers, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
  return briefDecisions(brief, shippedCatalogue, supported, after);
}

describe('briefDecisions: the style', () => {
  const answers: BriefAnswers = {
    architecture: {
      style: 'hexagonal',
      recommended: ['hexagonal', 'clean'],
      evidence: ['FEAT-001', 'FEAT-099'],
    },
  };

  it('RF-608 weighs the recommended styles, marks the chosen one and keeps supported evidence only', () => {
    const [style] = decisionsFor(answers).decisions;

    expect(style).toMatchObject({ id: 'ADR-001', status: 'Accepted', sources: ['FEAT-001'] });
    expect(style?.title).toBe('Architecture style: Hexagonal (ports and adapters)');
    expect(style?.options).toHaveLength(2);
    expect(style?.options[0]).toContain('(chosen)');
    expect(style?.options[1]).not.toContain('(chosen)');
    expect(style?.options[0]).toMatch(/Choose it when: .+\. Look elsewhere when: .+\.$/u);
  });

  it('RF-608 lists the chosen style as the only option when nothing was recommended', () => {
    const [style] = decisionsFor({ architecture: { style: 'clean' } }).decisions;

    expect(style?.options).toHaveLength(1);
    expect(style?.context).toContain('no recommendation');
    expect(style?.context).toContain('No supported card is named as evidence.');
  });

  it('RF-608 proposes the default style when the owner chose none', () => {
    const [style] = decisionsFor({}).decisions;

    expect(style?.status).toBe('Proposed');
    expect(style?.decision).toContain('Nobody chose a style');
  });
});

describe('briefDecisions: the stack and the migration', () => {
  const answers: BriefAnswers = {
    migration: 'rewrite',
    stack: [
      { layer: 'database', choice: 'PostgreSQL 17', custom: false },
      { layer: 'hosting', choice: 'Our own servers', custom: true },
    ],
  };

  it('RF-609 writes a record per chosen layer, numbered after the planner decisions', () => {
    const { decisions, choices } = decisionsFor(answers, 3);

    expect(decisions.map((each) => each.id)).toEqual(['ADR-004', 'ADR-005', 'ADR-006', 'ADR-007']);
    expect(choices.stack).toEqual([
      { layer: 'database', name: 'database', choice: 'PostgreSQL 17', decision: 'ADR-005' },
      { layer: 'hosting', name: 'hosting', choice: 'Our own servers', decision: 'ADR-006' },
    ]);
    expect(decisions[2]?.decision).toContain('The owner typed this choice.');
    expect(decisions[1]?.decision).toContain('picked it from the options');
  });

  it('RF-609 writes no record for a layer nobody chose', () => {
    const { decisions } = decisionsFor({});

    expect(decisions.map((each) => each.title)).toEqual([
      'Architecture style: Layered (N-tier)',
      'Migration strategy: Strangler Fig',
    ]);
  });

  it('RF-610 weighs all three strategies and marks the chosen one', () => {
    const { decisions, choices } = decisionsFor(answers);

    const migration = decisions.find((each) => each.id === choices.migration);
    expect(migration?.title).toBe('Migration strategy: Full rewrite');
    expect(migration?.status).toBe('Accepted');
    expect(migration?.options.map((each) => each.includes('(chosen)'))).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('RF-610 proposes the default strategy when none was chosen', () => {
    const migration = decisionsFor({}).decisions.at(-1);

    expect(migration?.status).toBe('Proposed');
    expect(migration?.decision).toContain('Nobody chose a strategy');
  });
});
