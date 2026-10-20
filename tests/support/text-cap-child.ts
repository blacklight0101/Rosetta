import { LimitCounter } from '../../src/infrastructure/sources/entry-guards.js';
import { RosettaError } from '../../src/domain/errors/rosetta-error.js';
import { DEFAULT_WORKBOOK_LIMITS } from '../../src/infrastructure/sources/workbook/workbook-limits.js';
import { readWorkbook } from '../../src/infrastructure/sources/workbook/workbook-reader.js';

// P3-58: run by a test in a child process with a small heap. A workbook holding one 100 MB text value
// must be refused (RST-1926) inside that heap; a reader that collects the whole value runs out of it
// and the child dies with a non-zero exit.
// Usage: node --max-old-space-size=80 --import ./scripts/register-ts.mjs <this file> <workbook file>

const path = process.argv[2];
if (path === undefined) throw new Error('A workbook file is needed');
const limits = DEFAULT_WORKBOOK_LIMITS;
try {
  await readWorkbook(
    { path, fileName: 'Big.xlsx' },
    limits,
    new LimitCounter(limits.maxCells),
    new AbortController().signal,
  );
  process.stdout.write('read');
} catch (error) {
  process.stdout.write(error instanceof RosettaError ? error.code : String(error));
}
