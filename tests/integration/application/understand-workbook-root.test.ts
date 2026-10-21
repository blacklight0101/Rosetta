import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-231 (Q-49), RF-155: an understand run over a workbook snapshot whose root holds only
// `dependencies.md` plans no `(root)` reader task for a single workbook, and plans it for two
// workbooks, where the file is the map between them.

const workbookKey = `workbook__${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}@${'a'.repeat(16)}`;
const made: string[] = [];

afterAll(async () => {
  for (const dir of made) await rm(dir, { recursive: true, force: true, maxRetries: 10 });
});

async function plannedNames(workbooks: readonly string[]): Promise<readonly string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'rosetta-wb-root-'));
  made.push(dir);
  const tree = join(dir, 'tree');
  for (const book of workbooks) {
    await mkdir(join(tree, book, 'Sheet1'), { recursive: true });
    await writeFile(join(tree, book, 'workbook.md'), `# ${book}\n`);
    await writeFile(join(tree, book, 'Sheet1', 'values.md'), '| A1 | 1 |\n');
  }
  await writeFile(join(tree, 'dependencies.md'), '# Dependencies\n');
  const h = await createUnderstandHarness({
    dataDir: join(dir, 'data'),
    recording: 'understand-workbook.json',
    verifierRecording: 'verifier-all-supported.json',
    repository: tree,
    upload: true,
    snapshotKey: workbookKey,
    workbookFolders: workbooks,
  });
  await h.scan();
  const run = await h.understand();
  const planned = z.object({ area: z.string() });
  return (await h.eventsOf(run))
    .filter((event) => event.type === 'agent.planned')
    .map((event) => planned.parse(event.data).area);
}

describe('an understand run over a workbook snapshot', () => {
  it('RF-231 a single workbook plans no (root) reader task', async () => {
    expect(await plannedNames(['Loan.xlsx'])).toEqual(['Loan.xlsx']);
  }, 120_000);

  it('RF-231 two workbooks plan the (root) task that reads dependencies.md', async () => {
    expect(await plannedNames(['Loan.xlsx', 'Rates.xlsx'])).toEqual([
      '(root)',
      'Loan.xlsx',
      'Rates.xlsx',
    ]);
  }, 120_000);
});
