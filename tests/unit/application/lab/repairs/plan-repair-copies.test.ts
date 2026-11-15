import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { repairTargets } from '../../../../../src/application/lab/targets/repair-targets.js';
import { draftFile, environment } from '../../../../support/lab-target-env.js';
import { invariant, scenario } from '../../../../support/task-card-fixtures.js';

// RF-1406 (P10-07, fix round 4): two requirements or task cards that differ only in letter case or
// in white space are one; a plural keeps them apart. The feature and rule cards a plan owes a
// requirement each are counted from the case, so a rule card cited only by a risk still counts.

interface PlanRepairCase {
  readonly id: string;
  readonly input: { readonly cards: readonly { readonly id: string; readonly type: string }[] };
}

const set = JSON.parse(await readFile('lab/cases/planner-plan-repair.json', 'utf8')) as {
  readonly cases: readonly PlanRepairCase[];
};
const phase = { name: 'First', goal: 'The catalog.', exitCriteria: ['The catalog is served.'] };
const task = (title: string, requirements: number[]) => ({
  ...{ title, phase: 1, requirements, acceptanceCriteria: [scenario], invariant },
  ...{ riskClass: 'none', adds: [], probes: [], files: ['src/catalog/'], dependsOn: [] },
});
const req = (statement: string, sources: readonly string[]) => ({
  ...{ title: statement, statement, sources: [...sources] },
});
const ids = (one: PlanRepairCase, keep: (type: string) => boolean) =>
  one.input.cards.filter((card) => keep(card.type)).map((card) => card.id);

function caseAt(at: number): PlanRepairCase {
  const one = set.cases[at];
  if (one === undefined) throw new Error('the set holds four cases');
  return one;
}

async function read(one: PlanRepairCase, plan: Record<string, unknown>) {
  const [, target] = repairTargets({
    gap: draftFile('planner/gap.v6.md', 'GAP'),
    plan: draftFile('planner/package.v12.md', 'PACKAGE'),
  });
  const parsed = target?.parseInput(one.input);
  if (parsed?.ok !== true) throw new Error(`the case ${one.id} does not read`);
  const { env } = environment([{ text: JSON.stringify({ phases: [phase], ...plan }) }]);
  return parsed.value.run(env, draftFile('x.v9.md', 'P'));
}

describe('the plan repair check of the lab: copies by spacing and plurals', () => {
  it('RF-1406 reads copies of one merged requirement that differ only in spacing as Shrunk', async () => {
    const one = caseAt(0);
    const every = ids(one, (type) => type !== 'OQ');
    const requirements = [
      req('The system serves the catalog.', every),
      req('The system serves the  catalog.', every),
      req('The system   serves the catalog. ', every),
    ];
    const tasks = [task('One', [1]), task('Two', [2]), task('Three', [3])];

    expect(await read(one, { requirements, tasks })).toMatchObject({
      ...{ usable: false, detail: 'Shrunk' },
      counts: { requirements: 3, 'distinct requirements': 1 },
    });
  });

  it('RF-1406 keeps a singular and a plural title apart, for requirements and task cards', async () => {
    const one = caseAt(3);
    const [first, ...rest] = ids(one, (type) => type !== 'OQ');
    const requirements = [
      req('Manage user', [first ?? '']),
      req('Manage users', rest.slice(0, 3)),
      req('Seed the catalog', rest.slice(3)),
    ];
    const tasks = [task('Seed product', [1]), task('Seed products', [2]), task('Stock', [3])];

    expect(await read(one, { requirements, tasks })).toMatchObject({
      ...{ usable: true, detail: 'Fixed' },
      counts: { 'distinct requirements': 3, 'distinct tasks': 3 },
    });
  });
});

describe('the plan repair check of the lab: the behaviour cards of the case', () => {
  it('RF-1406 counts a rule card cited only by a risk, so two requirements read Shrunk', async () => {
    const one = caseAt(1);
    const rules = ids(one, (type) => type === 'BR');
    const others = ids(one, (type) => type !== 'BR' && type !== 'OQ');
    const requirements = [
      req('Maintain the catalog', others.slice(0, 3)),
      req('Store it', others.slice(3)),
    ];
    const risks = [{ text: 'The rules may change.', sources: rules }];
    const tasks = [task('Catalog', [1]), task('Storage', [2])];

    expect(await read(one, { requirements, tasks, risks })).toMatchObject({
      ...{ usable: false, detail: 'Shrunk' },
      counts: { 'behaviour cards': 3, 'distinct requirements': 2 },
    });
  });
});
