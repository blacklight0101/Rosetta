import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTempRoot } from '../support/temp-root.js';

const run = promisify(execFile);
const vitest = join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
// A file that runs a contract suite from tests/contracts/ and a file with it.each tables.
const sample = [
  'tests/unit/infrastructure/system/clock-contract.test.ts',
  'tests/unit/presentation/web/error-mapper.test.ts',
];
const reportTotals = z.object({ numPassedTests: z.number(), numFailedTests: z.number() });

describe('toolchain end to end', () => {
  const tmp = useTempRoot('rosetta-toolchain-');

  it(
    'RNF-005 the level report prints the executed test count of a Vitest JSON report',
    { timeout: 120_000 },
    async () => {
      const report = join(tmp.path, 'vitest.json');
      await run('node', [vitest, 'run', ...sample, '--reporter=json', `--outputFile=${report}`]);
      const totals = reportTotals.parse(JSON.parse(await readFile(report, 'utf8')));

      // A failing run prints nothing on stdout, so the assertion below reports it.
      const { stdout } = await run('node', ['scripts/test-levels.mjs', '--report', report]).catch(
        () => ({ stdout: '' }),
      );

      const executed = totals.numPassedTests + totals.numFailedTests;
      expect(stdout).toMatch(
        new RegExp(`^Unit ${String(executed)} / Integration 0 / E2E \\d+`, 'u'),
      );
    },
  );
});
