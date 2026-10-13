// RNF-005 / DEC-30: prints the test pyramid by level, warns outside 60 / 30 / 10 +- 10 points,
// and fails when the run counts zero tests or a test runs outside the three level folders.
// Usage: node scripts/test-levels.mjs --report <vitest-json> [root]
// The Vitest counts come from the JSON report of the run (`vitest run --reporter=json`): every
// executed test (passed or failed) counts once, so each it.each row counts, and a contract suite
// from tests/contracts/ counts at the level of the test file that runs it (P1-61). Playwright
// specs (tests/e2e/**/*.spec.ts) run in a later step, so their tests are counted from the source.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const levels = [
  { name: 'Unit', folder: 'unit', target: 60 },
  { name: 'Integration', folder: 'integration', target: 30 },
  { name: 'E2E', folder: 'e2e', target: 10 },
];
const tolerance = 10;
const executed = new Set(['passed', 'failed']);
// A Vitest report older than this is left by an earlier run: its startTime is the start of that run.
const maxReportAgeMs = 60 * 60 * 1000;

// A Playwright declaration is test(...) or test.<modifier>(...); skipped and todo tests are not
// counted, nor are the members of Playwright's test that declare no test (describe, fail, fixme,
// slow, step, use, hooks, ...).
const notATest = String.raw`skip|todo|describe|fail|fixme|slow|step|use|before\w*|after\w*|extend|info|setTimeout|expect`;
const testDeclaration = new RegExp(
  String.raw`^\s*(?:it|test)(?:\.(?!(?:${notATest})\b)\w+)*(?:\([^)]*\))?\(`,
  'u',
);
const skippedSuite = /^\s*(?:describe|test\.describe)\.skip\(/u;

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

class LevelReportError extends Error {}

function fail(message) {
  throw new LevelReportError(message);
}

function parseArguments(args) {
  const at = args.indexOf('--report');
  const report = at >= 0 ? args[at + 1] : undefined;
  if (report === undefined) {
    fail('pass the Vitest JSON report with --report <file> (vitest run --reporter=json).');
  }
  const rest = args.filter((_, i) => i !== at && i !== at + 1);
  return { report: resolve(report), root: resolve(rest[0] ?? '.') };
}

async function readReport(path) {
  const text = await readFile(path, 'utf8').catch((error) => fail(`cannot read ${path}: ${error}`));
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    fail(`${path} is not a Vitest JSON report (invalid JSON).`);
  }
  const files = report?.testResults;
  const valid =
    Array.isArray(files) &&
    files.every((file) => typeof file?.name === 'string' && Array.isArray(file.assertionResults));
  if (!valid) fail(`${path} is not a Vitest JSON report (no testResults).`);
  if (typeof report.startTime !== 'number') {
    fail(`${path} is not a Vitest JSON report (no startTime).`);
  }
  return report;
}

// A report whose run started more than an hour ago does not belong to this check: refuse it.
function checkFresh(path, report) {
  const ageMs = Date.now() - report.startTime;
  if (ageMs > maxReportAgeMs) {
    const minutes = Math.round(ageMs / 60000);
    fail(
      `${path} is stale: its run started ${String(minutes)} minutes ago, so it is not from this run; run the tests again.`,
    );
  }
}

// The level of a test file is the folder under tests/; a file elsewhere has no level (DEC-30).
function levelOf(root, file) {
  const [top, folder] = relative(root, file).split(sep);
  return top === 'tests' ? levels.findIndex((level) => level.folder === folder) : -1;
}

function countReport(root, files) {
  const counts = levels.map(() => 0);
  const unlabelled = [];
  for (const file of files) {
    const runs = file.assertionResults.filter((test) => executed.has(test.status)).length;
    const level = levelOf(root, file.name);
    if (level >= 0) counts[level] += runs;
    else if (runs > 0) unlabelled.push(relative(root, file.name).split(sep).join('/'));
  }
  if (unlabelled.length > 0) {
    fail(`tests ran outside tests/unit, tests/integration and tests/e2e: ${unlabelled.join(', ')}`);
  }
  return counts;
}

async function countPlaywrightSpecs(root) {
  const folder = join(root, 'tests', 'e2e');
  const entries = await readdir(folder, { recursive: true, withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !/\.spec\.[cm]?[jt]sx?$/u.test(entry.name)) continue;
    const source = await readFile(join(entry.parentPath, entry.name), 'utf8');
    total += countInSource(source);
  }
  return total;
}

function report(counts) {
  const total = counts.reduce((sum, count) => sum + count, 0);
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

async function main() {
  const { report: reportPath, root } = parseArguments(process.argv.slice(2));
  const vitestReport = await readReport(reportPath);
  checkFresh(reportPath, vitestReport);
  const counts = countReport(root, vitestReport.testResults);
  // The zero-test guard looks at the Vitest report only: Playwright specs run in a later step.
  if (counts.every((count) => count === 0)) fail('the run counted zero tests (RNF-005, DEC-30).');
  counts[2] += await countPlaywrightSpecs(root);
  report(counts);
}

try {
  await main();
} catch (error) {
  if (!(error instanceof LevelReportError)) throw error;
  process.stderr.write(`test-levels: ${error.message}\n`);
  process.exitCode = 1;
}
