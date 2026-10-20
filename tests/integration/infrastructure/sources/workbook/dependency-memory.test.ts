import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

// RF-153: unresolved references are the one list that grows with the number of distinct names a
// hostile workbook invents. 200,000 formulas, each naming a sheet that does not exist, are mapped in a
// child process with a 512 MB heap: a map that keeps every name dies there.

const run = promisify(execFile);

it('RF-153 maps 200,000 formulas that each name a different missing sheet inside 512 MB', async () => {
  const args = [
    '--max-old-space-size=512',
    '--import',
    './scripts/register-ts.mjs',
    'tests/support/dependency-child.ts',
    '200000',
  ];
  const { stdout } = await run(process.execPath, args, { timeout: 120_000, encoding: 'utf8' });

  expect(stdout).toContain('Unresolved references not listed: ');
}, 150_000);
