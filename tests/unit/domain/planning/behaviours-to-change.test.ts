import { describe, expect, it } from 'vitest';
import {
  behavioursOf,
  behavioursToKeep,
} from '../../../../src/domain/planning/behaviours-to-keep.js';
import type { ClaimJudgement } from '../../../../src/domain/planning/claim-judgement.js';
import { keepOrFixRows } from '../../../../src/domain/planning/keep-or-fix.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-631, P5-41: a task keeps only the claims of what it builds; a kept claim that a decision or an
// answer changes is behaviour to change, naming the decision; a claim the planner judged a likely
// defect is a keep-or-fix row with a default of fix and is not pinned; nothing is dropped.

function card(id: string, type: SourceCard['type'], claims: readonly string[]): SourceCard {
  return {
    ...{ id, type, title: `Title ${id}`, summary: 'Summary.', area: 'orders' },
    claims: claims.map((text, index) => ({
      claimId: `${id}.c${String(index + 1)}`,
      text,
      citations: [{ path: `src/${id}.cs`, startLine: index + 1, endLine: index + 4 }],
      status: 'Supported',
    })),
  };
}

const sources = [
  card('FEAT-001', 'FEAT', [
    'Sign in compares the password as typed.',
    'Sign in opens the home page.',
  ]),
  card('FLOW-001', 'FLOW', ['Basket to checkout.']),
  card('FLOW-002', 'FLOW', ['Checkout to receipt.']),
  card('OQ-003', 'OQ', ['Cancel checks no role.']),
];
const requirements = [
  { id: 'REQ-001', sources: ['FEAT-001', 'OQ-003'] },
  { id: 'REQ-002', sources: ['FLOW-001', 'FLOW-002'] },
];

function judged(overrides: Partial<ClaimJudgement>): ClaimJudgement {
  return {
    ...{ claimId: 'FEAT-001.c1', kind: 'change', decisionId: 'ADR-002', reason: 'Hash it.' },
    ...{ security: false },
    ...overrides,
  };
}

describe('behavioursOf with judgements', () => {
  const task = planTask({ requirements: ['REQ-001'] });

  it('RF-631 a claim a decision changes is behaviour to change, naming the decision, and is not kept', () => {
    const result = behavioursOf(task, requirements, sources, { judgements: [judged({})] });

    expect(result.keep.map((each) => each.claimId)).toEqual(['FEAT-001.c2']);
    expect(result.change).toHaveLength(1);
    expect(result.change[0]).toMatchObject({ claimId: 'FEAT-001.c1', decisionId: 'ADR-002' });
  });

  it('RF-631 a claim an answer changes names the question card', () => {
    const answer = judged({ decisionId: undefined, answerCard: 'OQ-003' });
    const result = behavioursOf(task, requirements, sources, { judgements: [answer] });

    expect(result.change[0]).toMatchObject({ claimId: 'FEAT-001.c1', answerCard: 'OQ-003' });
  });

  it('RF-631 a claim judged a likely defect is neither kept nor changed: it is keep-or-fix', () => {
    const defect = judged({ kind: 'defect', decisionId: undefined });
    const result = behavioursOf(task, requirements, sources, { judgements: [defect] });

    expect(result.keep.map((each) => each.claimId)).not.toContain('FEAT-001.c1');
    expect(result.change).toEqual([]);
    expect(result.fix.map((each) => each.claimId)).toEqual(['FEAT-001.c1']);
  });
});

describe('behavioursOf, the other cases', () => {
  const task = planTask({ requirements: ['REQ-001'] });

  it('ADR-005 every claim of the task is in exactly one of the three lists', () => {
    const judgements = [judged({}), judged({ claimId: 'OQ-003.c1', kind: 'defect' })];
    const result = behavioursOf(task, requirements, sources, { judgements });

    const all = [...result.keep, ...result.change, ...result.fix].map((each) => each.claimId);

    expect(all.sort()).toEqual(['FEAT-001.c1', 'FEAT-001.c2']);
  });

  it('RF-631 with no judgement every claim is kept, as before', () => {
    const plain = behavioursOf(task, requirements, sources);

    expect(plain.keep.map((each) => each.claimId)).toEqual(['FEAT-001.c1', 'FEAT-001.c2']);
    expect(plain.change).toEqual([]);
    expect(plain.fix).toEqual([]);
    expect(behavioursToKeep(task, requirements, sources)).toEqual(plain.keep);
  });

  it('RF-631 a judgement of a claim the task does not carry changes nothing on it', () => {
    const other = judged({ claimId: 'FLOW-001.c1' });
    const result = behavioursOf(task, requirements, sources, { judgements: [other] });

    expect(result.keep.map((each) => each.claimId)).toEqual(['FEAT-001.c1', 'FEAT-001.c2']);
  });
});

describe('behavioursOf and what the task builds', () => {
  const task = planTask({ requirements: ['REQ-002'], builds: ['flow:FLOW-001'] });
  const scope = new Map([['flow:FLOW-001', ['FLOW-001']]]);

  it('RF-631 a task that builds one flow keeps the claims of that flow, not of the other flow its requirement cites', () => {
    const result = behavioursOf(task, requirements, sources, { scope });

    expect(result.keep.map((each) => each.claimId)).toEqual(['FLOW-001.c1']);
  });

  it('RF-631 a task that links no flow keeps the claims of every flow its requirement cites', () => {
    const open = planTask({ requirements: ['REQ-002'], builds: [] });
    const result = behavioursOf(open, requirements, sources, { scope });

    expect(result.keep.map((each) => each.claimId)).toEqual(['FLOW-001.c1', 'FLOW-002.c1']);
  });

  it('RF-631 what a task builds of one kind does not narrow the cards of another kind', () => {
    const mixed = planTask({ requirements: ['REQ-001', 'REQ-002'], builds: ['flow:FLOW-001'] });
    const result = behavioursOf(mixed, requirements, sources, { scope });

    expect(result.keep.map((each) => each.claimId)).toEqual([
      'FEAT-001.c1',
      'FEAT-001.c2',
      'FLOW-001.c1',
    ]);
  });
});

describe('keepOrFixRows', () => {
  const tasks = [
    planTask({ id: 'T-001', requirements: ['REQ-001'] }),
    planTask({ id: 'T-002', requirements: ['REQ-002'] }),
  ];

  it('P5-41 a row per claim judged a defect, numbered in card order, with the cards that carry it', () => {
    const judgements = [
      judged({ claimId: 'OQ-003.c1', kind: 'defect', security: true, decisionId: undefined }),
      judged({ claimId: 'FEAT-001.c1', kind: 'defect', decisionId: undefined }),
      judged({ claimId: 'FEAT-001.c2' }),
    ];

    const rows = keepOrFixRows(judgements, { tasks, requirements, sources, tables: [] });

    expect(rows.map((row) => [row.id, row.claimId, row.security, row.cards])).toEqual([
      ['KF-001', 'FEAT-001.c1', false, ['T-001']],
      ['KF-002', 'OQ-003.c1', true, []],
    ]);
  });

  it('P5-41 a judgement of a claim that is no supported claim makes no row', () => {
    const rows = keepOrFixRows([judged({ claimId: 'FEAT-009.c1', kind: 'defect' })], {
      ...{ tasks, requirements, sources, tables: [] },
    });

    expect(rows).toEqual([]);
  });
});
