import { renderProject } from '../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { book, sheet } from './rendered-workbook-fixtures.js';
import { withFormula } from './dependency-fixtures.js';

// P3-47: run by a test in a child process with a small heap. One formula per distinct missing sheet:
// the map must stay inside the memory it is given, whatever the number of distinct unresolved names.
// Usage: node --max-old-space-size=512 --import ./scripts/register-ts.mjs <this file> <formula count>

const count = Number(process.argv[2]);
if (!Number.isInteger(count) || count < 1) throw new Error('A formula count is needed');
const cells = Array.from({ length: count }, (_, i) =>
  withFormula(`A${String(i + 1)}`, `Missing_${'x'.repeat(80)}_${String(i)}!A1`),
);
const model = book([sheet('S', { cells })], { fileName: 'Big.xlsx' });
const { dependencies } = renderProject([model], { maxTotalBytes: 256 * 1024 * 1024 });
const lines = dependencies.content.split('\n');
const start = lines.indexOf('## Limits reached');
process.stdout.write(
  lines
    .slice(start + 1)
    .filter((line) => line !== '')
    .join('|'),
);
