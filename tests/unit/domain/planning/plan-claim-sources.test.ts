import { describe, expect, it } from 'vitest';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import type { PlanDraft } from '../../../../src/domain/planning/plan-draft.js';
import { draftTask } from '../../../support/task-card-fixtures.js';

// P8-02, RF-604, RF-607, EV-83: a `sources` entry written as a claim id (`ENT-001.c4`) counts as its
// card when the card is supported, in every `sources` list of the answer; an entry that names no
// supported card is still dropped. Under SDD a card that implements no requirement is kept until it
// can take its requirements from what it builds.

const supported = new Set(['FEAT-001', 'BR-001', 'ENT-001']);

function draft(overrides: Partial<PlanDraft> = {}): PlanDraft {
  return {
    summary: 'A new shop.',
    requirements: [
      { title: 'Order', statement: 'Place an order.', sources: ['FEAT-001.c2', 'ENT-001.c14'] },
      { title: 'Shipping', statement: 'Ship free.', sources: ['BR-001.c1', 'BR-001'] },
    ],
    components: [],
    decisions: [
      { title: 'One', context: 'C.', decision: 'D.', consequences: '', sources: ['BR-001.c3'] },
    ],
    entities: [{ legacy: 'Order', target: 'Order', notes: '', sources: ['ENT-001.c1'] }],
    phases: [{ name: 'First', goal: 'Orders.', exitCriteria: ['Orders run.'] }],
    tasks: [draftTask({ requirements: [1] })],
    risks: [{ text: 'Two thresholds.', sources: ['BR-001.c2'] }],
    technical: {
      integrations: [],
      security: [
        {
          ...{ name: 'Input check', approach: 'allowlist', description: 'Checks the input.' },
          ...{ invariant: '', alternative: '', decision: null, sources: ['FEAT-001.c1'] },
        },
      ],
      targets: [],
      environments: [],
    },
    ...overrides,
  };
}

describe('assemblePlan: claim ids in sources (P8-02)', () => {
  it('P8-02 RF-604 a claim id of a supported card counts as the card, once', () => {
    const { content, dropped } = assemblePlan(draft(), supported);

    expect(content.requirements).toMatchObject([
      { id: 'REQ-001', sources: ['FEAT-001', 'ENT-001'] },
      { id: 'REQ-002', sources: ['BR-001'] },
    ]);
    expect(dropped.requirements).toBe(0);
  });

  it('P8-02 RF-604 the entity mappings and the other sources lists accept claim ids too', () => {
    const { content, dropped } = assemblePlan(draft(), supported);

    expect(content.entities).toMatchObject([{ sources: ['ENT-001'] }]);
    expect(content.decisions).toMatchObject([{ sources: ['BR-001'] }]);
    expect(content.risks).toMatchObject([{ sources: ['BR-001'] }]);
    expect(content.technical.security).toMatchObject([{ sources: ['FEAT-001'] }]);
    expect(dropped.entities).toBe(0);
  });

  it('P8-02 RF-604 an entry that maps to no supported card is still dropped and counted', () => {
    const requirements = [
      { title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] },
      { title: 'Ghost', statement: 'No card.', sources: ['FEAT-009.c1', 'FEAT-001.x1', 'c1'] },
    ];

    const { content, dropped } = assemblePlan(draft({ requirements }), supported);

    expect(content.requirements).toMatchObject([{ title: 'Order' }]);
    expect(dropped.requirements).toBe(1);
  });
});

describe('assemblePlan: a card with no requirement under SDD (P8-02)', () => {
  const specified = { specificationDriven: true };

  it('P8-02 RF-607 a card that names no requirement is kept to derive one, not left out yet', () => {
    const tasks = [draftTask({ title: 'Bare', requirements: [] }), draftTask({ title: 'Orders' })];

    const { content, leftOut } = assemblePlan(draft({ tasks }), supported, specified);

    expect(content.tasks).toMatchObject([
      { title: 'Bare', requirements: [] },
      { title: 'Orders', requirements: ['REQ-001'] },
    ]);
    expect(leftOut).toEqual([]);
    expect(content.requirementNotes ?? []).not.toContainEqual(
      expect.objectContaining({ kind: 'none' }),
    );
  });
});
