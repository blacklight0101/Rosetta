import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseLabCaseSet, type LabCaseSet } from '../../../src/application/lab/lab-case-set.js';

// RF-1405, RF-1406: the repair sets are built from the committed eShopModernizing sets of the call
// they repair: each case is the input of a captured case of that call, with the problem lines (or,
// for the card repair, a fixed earlier answer) written by hand. No model answer is stored.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const REPAIR_SETS: readonly [string, string, string][] = [
  ['planner-gap-repair', 'planner/gap-repair', 'planner-gap'],
  ['planner-plan-repair', 'planner/plan-repair', 'planner-package'],
  ['cards-repair', 'cards/repair', 'cards-card-format'],
];

async function load(name: string): Promise<LabCaseSet> {
  const text = await readFile(join(root, 'lab', 'cases', `${name}.json`), 'utf8');
  const set = parseLabCaseSet(JSON.parse(text));
  if (!set.ok) throw new Error(`${name}: ${set.error.join('; ')}`);
  return set.value;
}

const REPAIR_KEYS = new Set(['problems', 'answer']);

/** The input of a repair case without what the repair adds: the input of the call it repairs. */
const withoutRepair = (input: unknown): string =>
  JSON.stringify(
    Object.fromEntries(Object.entries(input as object).filter(([key]) => !REPAIR_KEYS.has(key))),
  );

describe('the committed repair sets', () => {
  it.each(REPAIR_SETS)(
    'RF-1405 has %s, written for %s, with three cases and no expected label',
    async (name, prompt) => {
      const set = await load(name);

      expect(set.prompt).toBe(prompt);
      expect(set.cases.length).toBeGreaterThanOrEqual(3);
      expect(set.cases.every((each) => each.expected === undefined)).toBe(true);
      expect((set.sources ?? []).map((source) => source.key)).toEqual(['eshop']);
    },
  );

  it.each(REPAIR_SETS)(
    'RF-1405 builds every case of %s on a captured case of the call it repairs',
    async (name, _prompt, from) => {
      const set = await load(name);
      const captured = new Set((await load(from)).cases.map((each) => JSON.stringify(each.input)));

      const lost = set.cases.filter((each) => !captured.has(withoutRepair(each.input)));

      expect(lost.map((each) => each.id)).toEqual([]);
    },
  );
});
