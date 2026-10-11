// RNF-003 / DEC-42: fails when `npm audit --json` reports a high or critical advisory that has no
// unexpired entry in audit-exceptions.json. CI runs:
//   npm audit --audit-level=high --omit=dev --json > "$RUNNER_TEMP/audit-report.json" || true
//   node scripts/audit-check.mjs --report "$RUNNER_TEMP/audit-report.json" --today "$(date -u +%F)"
// Usage: node scripts/audit-check.mjs --report <file> [--exceptions <file>] --today YYYY-MM-DD
//
// audit-exceptions.json is a JSON array; each entry names one advisory and carries a reason and an
// expiry date (the last day the exception applies):
//   [{ "id": "GHSA-xxxx-xxxx-xxxx", "reason": "no fixed release yet", "expires": "2026-12-31" }]
// An expired exception is ignored, so the advisory fails the build again.
// Exit codes: 0 pass, 1 blocking advisory, 2 unusable input (report, exceptions or arguments).
import { readFile } from 'node:fs/promises';

const blocking = new Set(['high', 'critical']);
const advisoryId = /GHSA-[\da-z]{4}-[\da-z]{4}-[\da-z]{4}/iu;

class InputError extends Error {}

function parseArguments(argv) {
  const options = { exceptions: 'audit-exceptions.json' };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!['--report', '--exceptions', '--today'].includes(flag) || value === undefined) {
      throw new InputError(`Unknown or incomplete argument: ${String(flag)}`);
    }
    options[flag.slice(2)] = value;
  }
  if (options.report === undefined) throw new InputError('--report <file> is required');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(options.today ?? '')) {
    throw new InputError('--today YYYY-MM-DD is required (the script reads no clock)');
  }
  return options;
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new InputError(`Cannot read ${label} ${path}: ${error.message}`, { cause: error });
  }
}

function parseExceptions(raw) {
  if (!Array.isArray(raw)) throw new InputError('audit-exceptions.json must be a JSON array');
  return raw.map((entry, index) => {
    const valid =
      typeof entry?.id === 'string' &&
      typeof entry.reason === 'string' &&
      entry.reason.trim() !== '' &&
      /^\d{4}-\d{2}-\d{2}$/u.test(entry.expires ?? '');
    if (!valid) {
      throw new InputError(
        `audit-exceptions.json entry ${String(index)} needs id, reason and expires (YYYY-MM-DD)`,
      );
    }
    return entry;
  });
}

function checkReport(report) {
  if (report?.error !== undefined) {
    const { code = 'unknown', summary = '' } = report.error;
    throw new InputError(`npm audit failed: ${String(code)} ${String(summary)}`.trim());
  }
  if (typeof report?.vulnerabilities !== 'object' || report.vulnerabilities === null) {
    throw new InputError('The audit report has no "vulnerabilities" object');
  }
  return report.vulnerabilities;
}

// The advisories behind a package, following `via` entries that name another package.
function advisoriesOf(name, vulnerabilities, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const found = [];
  for (const via of vulnerabilities[name]?.via ?? []) {
    if (typeof via === 'string') found.push(...advisoriesOf(via, vulnerabilities, seen));
    else found.push(via);
  }
  return found;
}

function idOf(advisory) {
  return advisoryId.exec(advisory.url ?? '')?.[0] ?? String(advisory.url ?? advisory.title);
}

function evaluate(vulnerabilities, exceptions, today) {
  const failures = [];
  const excepted = [];
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    if (!blocking.has(entry.severity)) continue;
    for (const advisory of advisoriesOf(name, vulnerabilities)) {
      if (!blocking.has(advisory.severity)) continue;
      const id = idOf(advisory);
      const match = exceptions.find((candidate) => candidate.id.toUpperCase() === id.toUpperCase());
      if (match !== undefined && match.expires >= today)
        excepted.push(`${name}: ${id} (until ${match.expires})`);
      else if (match !== undefined)
        failures.push(`${name}: ${id} - exception expired on ${match.expires}`);
      else failures.push(`${name}: ${id} - ${advisory.title ?? advisory.severity}`);
    }
  }
  return { failures: [...new Set(failures)], excepted: [...new Set(excepted)] };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const vulnerabilities = checkReport(await readJson(options.report, 'audit report'));
  const exceptions = parseExceptions(await readJson(options.exceptions, 'exceptions file'));
  const { failures, excepted } = evaluate(vulnerabilities, exceptions, options.today);
  for (const line of excepted)
    process.stdout.write(`excepted  ${line}
`);
  for (const line of failures)
    process.stderr.write(`BLOCKING  ${line}
`);
  process.stdout.write(
    `npm audit: ${String(failures.length)} blocking, ${String(excepted.length)} excepted
`,
  );
  return failures.length === 0 ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  if (!(error instanceof InputError)) throw error;
  process.stderr.write(`${error.message}
`);
  process.exitCode = 2;
}
