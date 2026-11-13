import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseLabCaseSet, type LabCaseSet } from '../../../src/application/lab/lab-case-set.js';

// RF-1405: a hand-made variant of a captured case (id = the base id and `-spa`) holds the base input
// with other stack choices and is on its base case's side of the split, so the input of a held-back
// case is never tuned on through its variant; the set keeps a held-back case that asks for the contract.

const root = fileURLToPath(new URL('../../../', import.meta.url));

async function load(name: string): Promise<LabCaseSet> {
  const text = await readFile(join(root, 'lab', 'cases', `${name}.json`), 'utf8');
  const set = parseLabCaseSet(JSON.parse(text));
  if (!set.ok) throw new Error(`${name}: ${set.error.join('; ')}`);
  return set.value;
}

const SUFFIX = '-spa';
const CHOICES = new Set(['frontEnd', 'backEnd']);
const withoutChoices = (input: unknown): string =>
  JSON.stringify(Object.entries(input as object).filter(([key]) => !CHOICES.has(key)));

describe('the committed variant cases', () => {
  it('RF-1405 puts every -spa case of planner-api-contract on its base case side, with the base cards', async () => {
    const set = await load('planner-api-contract');
    const byId = new Map(set.cases.map((each) => [each.id, each]));

    const problems = set.cases
      .filter((each) => each.id.endsWith(SUFFIX))
      .flatMap((each) => {
        const base = byId.get(each.id.slice(0, -SUFFIX.length));
        if (base === undefined) return [`${each.id}: no base case`];
        const same = withoutChoices(base.input) === withoutChoices(each.input);
        return [
          ...(base.split === each.split ? [] : [`${each.id}: ${each.split}, base ${base.split}`]),
          ...(same ? [] : [`${each.id}: other cards than its base`]),
        ];
      });

    expect(problems).toEqual([]);
  });

  it('RF-1405 keeps a held-back case of planner-api-contract that asks for the contract', async () => {
    const set = await load('planner-api-contract');

    const asked = set.cases.filter(
      (each) => each.split === 'held-back' && each.id.endsWith(SUFFIX),
    );

    expect(asked.length).toBeGreaterThan(0);
  });
});
