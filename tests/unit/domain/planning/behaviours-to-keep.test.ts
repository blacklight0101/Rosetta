import { describe, expect, it } from 'vitest';
import {
  behavioursKeptByNoCard,
  behavioursToKeep,
} from '../../../../src/domain/planning/behaviours-to-keep.js';
import type { ModelTable } from '../../../../src/domain/planning/data-model.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-631, DEC-135, ADR-018: a task card names the behaviour of the legacy system it must not change:
// the supported claims, with their citations, of the FEAT, BR, FLOW and SCRN cards that the
// requirements it builds come from.

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
  card('BR-001', 'BR', ['Orders over 50 ship free.']),
  card('ENT-001', 'ENT', ['An order has lines.']),
  card('FEAT-001', 'FEAT', ['Checkout creates an order.', 'Checkout shows a total.']),
  card('FLOW-001', 'FLOW', ['Basket, checkout, confirmation.']),
  card('OQ-001', 'OQ', ['Cancel checks no role.']),
  card('SCRN-001', 'SCRN', ['The basket page lists lines.']),
];

const requirements = [
  { id: 'REQ-001', sources: ['FEAT-001'] },
  { id: 'REQ-002', sources: ['BR-001', 'FEAT-001'] },
  { id: 'REQ-003', sources: ['ENT-001', 'OQ-001'] },
  { id: 'REQ-004', sources: ['FLOW-001', 'SCRN-001'] },
];

function keptBy(ids: readonly string[]): string[] {
  const task = planTask({ requirements: ids });
  return behavioursToKeep(task, requirements, sources).map((each) => each.claimId);
}

describe('behavioursToKeep', () => {
  it('RF-631 lists every supported claim of the FEAT card a requirement comes from', () => {
    expect(keptBy(['REQ-001'])).toEqual(['FEAT-001.c1', 'FEAT-001.c2']);
  });

  it('RF-631 lists the behaviours of BR, FLOW and SCRN cards as well', () => {
    expect(keptBy(['REQ-002', 'REQ-004'])).toEqual([
      'BR-001.c1',
      'FEAT-001.c1',
      'FEAT-001.c2',
      'FLOW-001.c1',
      'SCRN-001.c1',
    ]);
  });

  it('RF-631 carries the card, the text and the citation of each behaviour', () => {
    const [first] = behavioursToKeep(
      planTask({ requirements: ['REQ-001'] }),
      requirements,
      sources,
    );

    expect(first).toEqual({
      cardId: 'FEAT-001',
      claimId: 'FEAT-001.c1',
      text: 'Checkout creates an order.',
      citations: [{ path: 'src/FEAT-001.cs', startLine: 1, endLine: 4 }],
    });
  });

  it('RF-631 lists the behaviours of a card once when two requirements name it', () => {
    expect(keptBy(['REQ-001', 'REQ-002'])).toEqual(['BR-001.c1', 'FEAT-001.c1', 'FEAT-001.c2']);
  });

  it('RF-631 lists nothing for a task that builds no feature, rule, flow or screen', () => {
    expect(keptBy(['REQ-003'])).toEqual([]);
    expect(keptBy([])).toEqual([]);
  });

  it('RF-631 ignores a requirement id the package does not know', () => {
    expect(keptBy(['REQ-099'])).toEqual([]);
  });
});

describe('behavioursToKeep and claims the verifier did not support', () => {
  it('RF-631 lists only the Supported claims of a card, never a rejected or unverified one', () => {
    const mixed: SourceCard = {
      ...card('FEAT-009', 'FEAT', ['Supported claim.', 'Rejected claim.', 'Unverified claim.']),
      claims: card('FEAT-009', 'FEAT', [
        'Supported claim.',
        'Rejected claim.',
        'Unverified claim.',
      ]).claims.map((claim, at) => ({
        ...claim,
        status: (['Supported', 'Rejected', 'Unverified'] as const)[at] ?? 'Rejected',
      })),
    };

    const kept = behavioursToKeep(
      planTask({ requirements: ['REQ-009'] }),
      [{ id: 'REQ-009', sources: ['FEAT-009'] }],
      [mixed],
    );

    expect(kept.map((each) => each.claimId)).toEqual(['FEAT-009.c1']);
  });
});

// RF-631, DEC-135, ADR-018: the migrations card (the first card, written by code) keeps only the
// business rules that name a table or a column it creates, in their text or their citations.
const migrationTitle = 'Write the database migrations in the chosen stack';

function claimAt(text: string, path: string): SourceCard['claims'][number] {
  return {
    claimId: '',
    text,
    citations: [{ path, startLine: 1, endLine: 4 }],
    status: 'Supported',
  };
}

function tableNamed(name: string, columns: readonly string[]): ModelTable {
  return {
    name,
    purpose: 'Keeps rows.',
    sources: [],
    columns: columns.map((column) => ({
      name: column,
      type: 'text',
      nullable: true,
      legacy: null,
      migrationRisk: '',
    })),
    primaryKey: [],
    uniqueKeys: [],
    foreignKeys: [],
    checks: [],
    indexes: [],
  };
}

const modelTables = [
  tableNamed('customer', ['id', 'loyalty_tier']),
  tableNamed('order', ['total']),
];

const namedSources: readonly SourceCard[] = [
  {
    ...{ id: 'BR-010', type: 'BR', title: 'Discount', summary: 'S.', area: 'orders' },
    claims: [
      {
        ...claimAt('The loyalty_tier of a customer sets the discount.', 'src/Orders/Discount.cs'),
        claimId: 'BR-010.c1',
      },
      { ...claimAt('Orders over 50 ship free.', 'src/Orders/Shipping.cs'), claimId: 'BR-010.c2' },
      { ...claimAt('Shipping adds the fee.', 'src/Orders/total.cs'), claimId: 'BR-010.c3' },
    ],
  },
  {
    ...{ id: 'FEAT-010', type: 'FEAT', title: 'Checkout', summary: 'S.', area: 'orders' },
    claims: [
      {
        ...claimAt('Checkout creates an order.', 'src/Orders/Checkout.cs'),
        claimId: 'FEAT-010.c1',
      },
    ],
  },
  {
    ...{
      id: 'FLOW-010',
      type: 'FLOW',
      title: 'Buy',
      summary: 'S.',
      area: 'orders',
      flow: { trigger: 't', outcome: 'o' },
    },
    claims: [
      { ...claimAt('The customer checks out.', 'src/Orders/Flow.cs'), claimId: 'FLOW-010.c1' },
    ],
  },
  {
    ...{ id: 'SCRN-010', type: 'SCRN', title: 'Basket', summary: 'S.', area: 'orders' },
    claims: [
      {
        ...claimAt('The basket page lists the total.', 'src/Orders/Basket.cs'),
        claimId: 'SCRN-010.c1',
      },
    ],
  },
];

const namedRequirements = [
  { id: 'REQ-010', sources: ['BR-010', 'FEAT-010'] },
  { id: 'REQ-011', sources: ['FLOW-010', 'SCRN-010'] },
];

const migrationTask = planTask({
  id: 'T-001',
  title: migrationTitle,
  requirements: ['REQ-010', 'REQ-011'],
  builds: ['table:customer', 'table:order'],
});

function keptOf(task: ReturnType<typeof planTask>): string[] {
  return behavioursToKeep(task, namedRequirements, namedSources, modelTables).map(
    (each) => each.claimId,
  );
}

describe('behavioursToKeep on the migrations card', () => {
  it('RF-631 keeps only the business rules that name a table or a column it creates', () => {
    expect(keptOf(migrationTask)).toEqual(['BR-010.c1', 'BR-010.c3']);
  });

  it('RF-631 keeps no feature, flow or screen claim on the migrations card', () => {
    const kept = keptOf(migrationTask);

    expect(kept.some((id) => /^(FEAT|FLOW|SCRN)-/u.test(id))).toBe(false);
  });

  it('RF-631 keeps a rule whose text names a column of the table', () => {
    expect(keptOf(migrationTask)).toContain('BR-010.c1');
  });

  it('RF-631 keeps a rule whose citation names a table or a column', () => {
    expect(keptOf(migrationTask)).toContain('BR-010.c3');
  });

  it('RF-631 drops a rule that names no table or column of the migrations card', () => {
    expect(keptOf(migrationTask)).not.toContain('BR-010.c2');
  });

  it('RF-631 keeps the feature, flow and screen claims on a task that is not the migrations card', () => {
    expect(keptOf(planTask({ id: 'T-002', requirements: ['REQ-010', 'REQ-011'] }))).toEqual([
      'BR-010.c1',
      'BR-010.c2',
      'BR-010.c3',
      'FEAT-010.c1',
      'FLOW-010.c1',
      'SCRN-010.c1',
    ]);
  });
});

describe('behavioursKeptByNoCard', () => {
  it('RF-631 lists the claims the migrations card dropped that no card keeps any more', () => {
    const tasks = [migrationTask, planTask({ id: 'T-002', requirements: ['REQ-011'] })];

    const lost = behavioursKeptByNoCard(tasks, namedRequirements, namedSources, modelTables);

    expect(lost.map((each) => each.claimId)).toEqual(['BR-010.c2', 'FEAT-010.c1']);
    expect(lost[0]).toEqual({
      cardId: 'BR-010',
      claimId: 'BR-010.c2',
      text: 'Orders over 50 ship free.',
      citations: [{ path: 'src/Orders/Shipping.cs', startLine: 1, endLine: 4 }],
    });
  });

  it('RF-631 lists nothing when another card keeps every claim the migrations card dropped', () => {
    const tasks = [migrationTask, planTask({ id: 'T-002', requirements: ['REQ-010', 'REQ-011'] })];

    expect(behavioursKeptByNoCard(tasks, namedRequirements, namedSources, modelTables)).toEqual([]);
  });

  it('RF-631 lists nothing when the package has no migrations card', () => {
    const tasks = [planTask({ id: 'T-001', requirements: ['REQ-010'] })];

    expect(behavioursKeptByNoCard(tasks, namedRequirements, namedSources, modelTables)).toEqual([]);
  });
});
