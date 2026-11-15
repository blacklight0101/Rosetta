import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { parseLabCaseSet } from '../../../src/application/lab/lab-case-set.js';

// RF-1405, RF-1406: the plan document sets are committed from eShopModernizing runs; the sets of the
// workbooks stay in the git-ignored folder and no committed file holds one.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const PLANNER_SETS: readonly [string, string][] = [
  ['planner-prd', 'planner/prd'],
  ['planner-package', 'planner/package'],
  ['planner-data-model', 'planner/data-model'],
  ['planner-api-contract', 'planner/api-contract'],
  ['planner-ux', 'planner/ux'],
  ['planner-flows', 'planner/flows'],
  ['planner-coverage', 'planner/coverage'],
];

describe('the committed plan document sets', () => {
  it.each(PLANNER_SETS)(
    'RF-1405 has %s, written for %s, with three cases',
    async (name, prompt) => {
      const text = await readFile(join(root, 'lab', 'cases', `${name}.json`), 'utf8');

      const set = parseLabCaseSet(JSON.parse(text));

      expect(set.ok && set.value.prompt).toBe(prompt);
      expect(set.ok && set.value.cases.length >= 3).toBe(true);
      expect(set.ok && set.value.cases.every((each) => each.expected === undefined)).toBe(true);
    },
  );

  it('RF-1405 commits no set of the workbooks', async () => {
    const listed = await promisify(execFile)('git', ['ls-files', 'lab'], { cwd: root });

    expect(listed.stdout).not.toMatch(/workbooks|local-cases|local-sources/u);
  });
});
