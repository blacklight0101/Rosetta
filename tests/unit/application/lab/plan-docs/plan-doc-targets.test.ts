import { describe, expect, it } from 'vitest';
import { planDocTargets } from '../../../../../src/application/lab/targets/plan-doc-targets.js';
import { draftFile, environment } from '../../../../support/lab-target-env.js';

// RF-1406, ADR-029: the plan document targets read an answer with the run's own parser and name
// what it held; a case with an unknown key or a citation that does not read is refused.

const targets = planDocTargets(draftFile('planner/package.v9.md', 'PACKAGE'));
const find = (id: string) => {
  const found = targets.find((each) => each.id === id);
  if (found === undefined) throw new Error(id);
  return found;
};
const card = {
  id: 'FEAT-001',
  type: 'FEAT',
  title: 'Checkout',
  summary: 'Pays.',
  claims: [{ claimId: 'FEAT-001.c1', text: 'Pays.', citations: ['src/A.cs:1-2'] }],
};

const inputs: Record<string, unknown> = {
  'planner/prd': { cards: [card], owner: { planningBrief: {} } },
  'planner/package': { cards: [card], owner: { planningBrief: {} } },
  'planner/workbook': { cards: [card], owner: { workbookSetup: {} } },
  'planner/data-model': {
    entities: [{ id: 'ENT-001', title: 'Order', summary: 'S', claims: card.claims }],
    database: null,
    dataAccess: null,
    dataMigration: null,
  },
  'planner/api-contract': {
    featureCards: [card],
    entities: [],
    frontEnd: 'Razor Pages',
    backEnd: null,
    database: null,
    style: 'layered',
  },
  'planner/ux': { screenCards: [], frontEnd: null, style: 'layered' },
  'planner/flows': { flowCards: [], components: [{ name: 'UI', responsibility: 'Pages.' }] },
  'planner/coverage': { tasks: [{ title: 'T', acceptanceCriteria: [] }], items: [] },
  'planner/adr-model': { decisions: [], tables: [] },
};

const answers: readonly (readonly [string, string, string])[] = [
  [
    'planner/prd',
    '{"features":[{"title":"A","description":"B","priority":"Must","sources":[]}]}',
    'Features',
  ],
  ['planner/data-model', '{"tables":[{"name":"orders"}]}', 'NoTables'],
  ['planner/data-model', '{"tables":[]}', 'Unusable'],
  ['planner/api-contract', '{"applies":false,"reason":"none"}', 'NoOperations'],
  ['planner/flows', '{"flows":[]}', 'Unusable'],
  ['planner/coverage', '{"links":[]}', 'NoLinks'],
  ['planner/adr-model', '{"missing":[]}', 'NoMissing'],
  ['planner/package', 'No plan.', 'Unusable'],
];

describe('the plan document targets', () => {
  it.each(Object.keys(inputs))('RF-1406 runs %s under the prompt it is given', async (id) => {
    const parsed = find(id).parseInput(inputs[id]);
    if (!parsed.ok) throw new Error(parsed.error);
    const { env, requests } = environment([{ text: 'x' }]);

    await parsed.value.run(env, draftFile('x.v9.md', 'The prompt under test.'));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.context.role).toBe('planner');
    const system = requests[0]?.system ?? '';
    expect(system).toContain('The prompt under test.');
    expect(system.includes('PACKAGE')).toBe(id === 'planner/workbook');
    expect(requests[0]?.messages[0]?.content.match(/<<<ROSETTA-DATA /gu)).toHaveLength(2);
  });

  it.each(answers)('RF-1406 reads the answer for %s: %s is %s', async (id, text, detail) => {
    const parsed = find(id).parseInput(inputs[id]);
    if (!parsed.ok) throw new Error(parsed.error);
    const { env } = environment([{ text }]);

    const outcome = await parsed.value.run(env, draftFile('x.v9.md', 'P'));

    expect(outcome.detail).toBe(detail);
    expect(find(id).readsAnswer(text)).toBe(outcome.usable);
  });

  it.each(Object.keys(inputs))('RF-1401 refuses a stray key for %s', (id) => {
    expect(find(id).parseInput({ ...(inputs[id] as object), stray: 1 }).ok).toBe(false);
  });

  it('RF-1401 refuses a citation that does not read', () => {
    const bad = { ...card, claims: [{ ...card.claims[0], citations: ['not a citation'] }] };

    expect(find('planner/prd').parseInput({ cards: [bad], owner: {} }).ok).toBe(false);
  });
});
