import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { repairTargets } from '../../../../../src/application/lab/targets/repair-targets.js';
import { draftFile, environment } from '../../../../support/lab-target-env.js';
import { invariant, scenario } from '../../../../support/task-card-fixtures.js';

// RF-1406, RF-1403, RF-604 (P10-07, fix round 3): a plan repair that merges its requirements into
// one, or pads its counts with copies, is `Shrunk` on every committed case: the package prompt asks
// for one requirement per behaviour the cards show, and the problem lines give the floor of the
// earlier answer's counts. Each case result keeps the counts the check used.

interface CaseCard {
  readonly id: string;
  readonly type: string;
}
interface PlanRepairCase {
  readonly id: string;
  readonly input: { readonly cards: readonly CaseCard[] };
}

const set = JSON.parse(await readFile('lab/cases/planner-plan-repair.json', 'utf8')) as {
  readonly cases: readonly PlanRepairCase[];
};
const phase = { name: 'First', goal: 'The catalog.', exitCriteria: ['The catalog is served.'] };
const task = (title: string, requirements: number[]) => ({
  ...{ title, phase: 1, requirements, acceptanceCriteria: [scenario], invariant },
  ...{ riskClass: 'none', adds: [], probes: [], files: ['src/catalog/'], dependsOn: [] },
});
const req = (title: string, sources: readonly string[]) => ({
  ...{ title, statement: `The system does ${title}.`, sources: [...sources] },
});
const plan = (requirements: unknown[], tasks: unknown[]) =>
  JSON.stringify({ requirements, phases: [phase], tasks });
const cardsOf = (one: PlanRepairCase) => one.input.cards.filter((card) => card.type !== 'OQ');

async function read(one: PlanRepairCase, text: string) {
  const [, target] = repairTargets({
    gap: draftFile('planner/gap.v6.md', 'GAP'),
    plan: draftFile('planner/package.v12.md', 'PACKAGE'),
  });
  const parsed = target?.parseInput(one.input);
  if (parsed?.ok !== true) throw new Error(`the case ${one.id} does not read`);
  const { env } = environment([{ text }]);
  return parsed.value.run(env, draftFile('x.v9.md', 'P'));
}

/** One requirement and one task card for every card of the case that is not an open question. */
function whole(one: PlanRepairCase): string {
  const cards = cardsOf(one);
  return plan(
    cards.map((card) => req(card.id, [card.id])),
    cards.map((card, at) => task(`Build ${card.id}`, [at + 1])),
  );
}

describe('the plan repair check of the lab: a merged plan', () => {
  it.each(set.cases.map((one) => [one.id, one] as const))(
    'RF-1406 reads one requirement citing every card, one phase and one task as Shrunk (%s)',
    async (_id, one) => {
      const merged = plan(
        [
          req(
            'the catalog',
            cardsOf(one).map((card) => card.id),
          ),
        ],
        [task('All', [1])],
      );

      expect(await read(one, merged)).toMatchObject({ usable: false, detail: 'Shrunk' });
    },
  );

  it.each(set.cases.map((one) => [one.id, one] as const))(
    'RF-1406 reads one requirement and one task per card as Fixed (%s)',
    async (_id, one) => {
      expect(await read(one, whole(one))).toMatchObject({ usable: true, detail: 'Fixed' });
    },
  );
});

describe('the plan repair check of the lab: a padded plan', () => {
  const [, , , withTasks] = set.cases;
  if (withTasks === undefined) throw new Error('the set holds four cases');

  it('RF-1406 reads copies of one task card as Shrunk when the problems name task 3', async () => {
    const cards = cardsOf(withTasks);
    const every = cards.map((_card, at) => at + 1);
    const copies = plan(
      cards.map((card) => req(card.id, [card.id])),
      [task('All', every), task('All', every), task('all ', every)],
    );

    expect(await read(withTasks, copies)).toMatchObject({ usable: false, detail: 'Shrunk' });
  });

  it('RF-1406 reads copies of one merged requirement as Shrunk', async () => {
    const ids = cardsOf(withTasks).map((card) => card.id);
    const copies = plan(
      [req('the catalog', ids), req('the catalog', ids), req('The  Catalog', ids)],
      [task('One', [1]), task('Two', [2]), task('Three', [3])],
    );

    expect(await read(withTasks, copies)).toMatchObject({ usable: false, detail: 'Shrunk' });
  });
});

describe('the plan repair check of the lab: the counts it used', () => {
  it('RF-1403 RF-1406 records the counts of the check in the case result', async () => {
    const [first] = set.cases;
    if (first === undefined) throw new Error('the set holds four cases');

    const counts = {
      ...{ requirements: 7, 'distinct requirements': 7, 'behaviour cards': 3, phases: 1 },
      ...{ tasks: 7, 'distinct tasks': 7, 'cited cards': 7, 'uncovered requirements': 0 },
      ...{ 'requirement floor': 3, 'task floor': 0 },
    };

    expect(await read(first, whole(first))).toMatchObject({ detail: 'Fixed', counts });
  });
});
