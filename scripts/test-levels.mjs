// RNF-005 / DEC-30: prints the test pyramid by level, warns outside 60 / 30 / 10 +- 10 points,
// and fails when the run counts zero tests. Usage: node scripts/test-levels.mjs [root]
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const levels = [
  { name: 'Unit', folder: 'unit', target: 60 },
  { name: 'Integration', folder: 'integration', target: 30 },
  { name: 'E2E', folder: 'e2e', target: 10 },
];
const tolerance = 10;
// A declaration is it(...), test(...) or it.each(...)(...); skipped and todo tests are not counted.
const testDeclaration = /^\s*(?:it|test)(?:\.(?!skip\b|todo\b)\w+)*(?:\([^)]*\))?\(/u;
const skippedSuite = /^\s*describe\.skip\(/u;

const indentOf = (line) => line.length - line.trimStart().length;
const braceBalance = (line) => line.split('{').length - line.split('}').length;

// Counts declarations line by line; Prettier-formatted code closes a suite at its own indentation,
// and a skipped suite whose braces balance on its own line is skipped as that one line.
function countInSource(source) {
  let count = 0;
  let skipIndent = -1;
  for (const line of source.split('\n')) {
    if (skipIndent >= 0) {
      if (line.trimStart().startsWith('}') && indentOf(line) <= skipIndent) skipIndent = -1;
    } else if (skippedSuite.test(line)) {
      if (braceBalance(line) > 0) skipIndent = indentOf(line);
    } else if (testDeclaration.test(line)) {
      count += 1;
    }
  }
  return count;
}

async function listTestFiles(folder) {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && /\.test\.[cm]?[jt]sx?$/u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

async function countTests(folder) {
  let total = 0;
  for (const file of await listTestFiles(folder)) {
    total += countInSource(await readFile(file, 'utf8'));
  }
  return total;
}

const root = resolve(process.argv[2] ?? '.');
const counts = [];
for (const level of levels) {
  counts.push(await countTests(join(root, 'tests', level.folder)));
}
const total = counts.reduce((sum, count) => sum + count, 0);

function report() {
  const out = (text) => process.stdout.write(`${text}\n`);
  const shares = counts.map((count) => Math.round((count / total) * 100));
  out(levels.map((level, i) => `${level.name} ${String(counts[i])}`).join(' / '));
  out(`Shares ${shares.map((share) => `${String(share)}%`).join(' / ')} (target 60% / 30% / 10%)`);

  const off = levels.filter((level, i) => Math.abs((shares[i] ?? 0) - level.target) > tolerance);
  if (off.length > 0) {
    const names = off.map((level) => level.name).join(', ');
    out(
      `WARNING: outside the 60 / 30 / 10 +- ${String(tolerance)} band: ${names} (guideline, DEC-30).`,
    );
  }
}

if (total === 0) {
  process.stderr.write('test-levels: the run counted zero tests (RNF-005, DEC-30).\n');
  process.exitCode = 1;
} else {
  report();
}
