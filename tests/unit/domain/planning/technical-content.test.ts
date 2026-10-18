import { describe, expect, it } from 'vitest';
import type { PlanDraft } from '../../../../src/domain/planning/plan-draft.js';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';

// RF-622, RF-602, ADR-005, DEC-135: the technical part of the planner's draft is checked against the
// supported cards and the decisions the draft lists before it becomes the content of trd.md.

const supported = new Set(['FEAT-001', 'BR-001', 'INT-001']);

const empty = { integrations: [], security: [], targets: [], environments: [] } as const;

function draft(technical: Partial<PlanDraft['technical']>): PlanDraft {
  return {
    summary: '',
    requirements: [{ title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] }],
    components: [],
    decisions: [
      { title: 'One', context: 'C.', decision: 'D.', consequences: '', sources: [] },
      { title: 'Two', context: 'C.', decision: 'D.', consequences: '', sources: [] },
    ],
    entities: [],
    phases: [],
    tasks: [],
    risks: [],
    technical: { ...empty, ...technical },
  };
}

const control = {
  name: 'Upload filter',
  approach: 'denylist',
  description: 'Rejects forbidden extensions.',
  invariant: 'Nothing uploaded runs.',
  alternative: 'Allow a list of extensions.',
  sources: ['BR-001'],
  decision: null,
} as const;

describe('assemblePlan: the technical part', () => {
  it('RF-622 keeps an integration only for a supported card, once, with the first answer', () => {
    const { content, dropped } = assemblePlan(
      draft({
        integrations: [
          { card: 'INT-001', action: 'replace', note: 'Wrap it.', decision: 2 },
          { card: 'INT-001', action: 'keep', note: 'Again.', decision: null },
          { card: 'INT-404', action: 'keep', note: 'Unknown.', decision: null },
        ],
      }),
      supported,
    );

    expect(content.technical.integrations).toEqual([
      { card: 'INT-001', action: 'replace', note: 'Wrap it.', decision: 'ADR-002' },
    ]);
    expect(dropped.technical).toBe(2);
  });

  it('RF-622 a decision position that the draft does not have links no record', () => {
    const { content } = assemblePlan(
      draft({
        security: [
          { ...control, decision: 3 },
          { ...control, name: 'Second', decision: 0 },
          { ...control, name: 'Third', decision: 1 },
        ],
      }),
      supported,
    );

    expect(content.technical.security.map((each) => each.decision)).toEqual(['', '', 'ADR-001']);
  });
});

describe('assemblePlan: the technical part, sources', () => {
  it('RF-622 a security control or a target with no supported source card is left out', () => {
    const { content, dropped } = assemblePlan(
      draft({
        security: [control, { ...control, name: 'Made up', sources: ['XYZ-999'] }],
        targets: [
          { name: 'Time', target: 'Two seconds.', sources: ['FEAT-001', 'X-1'], decision: null },
          { name: 'Uptime', target: 'Always.', sources: [], decision: null },
        ],
      }),
      supported,
    );

    expect(content.technical.security.map((each) => each.name)).toEqual(['Upload filter']);
    expect(content.technical.targets).toEqual([
      { name: 'Time', target: 'Two seconds.', sources: ['FEAT-001'], decision: '' },
    ]);
    expect(dropped.technical).toBe(2);
  });
});

describe('assemblePlan: the technical part, controls and environments', () => {
  it('RF-622 DEC-135 the approach of a control is kept as the planner marked it', () => {
    const { content } = assemblePlan(
      draft({
        security: [control, { ...control, name: 'Role', approach: 'allowlist' }],
      }),
      supported,
    );

    expect(content.technical.security.map((each) => each.approach)).toEqual([
      'denylist',
      'allowlist',
    ]);
  });

  it('RF-622 an environment is kept with its record when the draft has it', () => {
    const { content } = assemblePlan(
      draft({
        environments: [
          { name: 'Staging', purpose: 'Before a release.', decision: 1 },
          { name: 'Production', purpose: 'Customers.', decision: 9 },
        ],
      }),
      supported,
    );

    expect(content.technical.environments).toEqual([
      { name: 'Staging', purpose: 'Before a release.', decision: 'ADR-001' },
      { name: 'Production', purpose: 'Customers.', decision: '' },
    ]);
  });
});
