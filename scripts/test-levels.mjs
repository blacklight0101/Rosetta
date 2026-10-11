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
const testDeclaration = /^\s*(?:it|test)(?:\.\w+)*(?:\([^)]*\))?\(/gmu;

async function listTestFiles(folder) {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && /\.test\.[cm]?[jt]sx?$/u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

async function countTests(folder) {
  let total = 0;
  for (const file of await listTestFiles(folder)) {
    total += (await readFile(file, 'utf8')).match(testDeclaration)?.length ?? 0;
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
  const shares = counts.map((count) => Math.round((count / total) * 100));
  console.log(levels.map((level, i) => `${level.name} ${String(counts[i])}`).join(' / '));
  console.log(
    `Shares ${shares.map((share) => `${String(share)}%`).join(' / ')} (target 60% / 30% / 10%)`,
  );

  const off = levels.filter((level, i) => Math.abs((shares[i] ?? 0) - level.target) > tolerance);
  if (off.length > 0) {
    console.log(
      `WARNING: outside the 60 / 30 / 10 +- ${String(tolerance)} band: ${off.map((level) => level.name).join(', ')} (guideline, DEC-30).`,
    );
  }
}

if (total === 0) {
  console.error('test-levels: the run counted zero tests (RNF-005, DEC-30).');
  process.exitCode = 1;
} else {
  report();
}
