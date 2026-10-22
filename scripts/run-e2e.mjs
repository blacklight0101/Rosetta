// RNF-005, P1-13: builds the front end and runs the Playwright project (playwright.config.ts)
// against a disposable schema of the PostgreSQL at ROSETTA_TEST_DATABASE_URL.
// Usage: node scripts/run-e2e.mjs [--ci] [playwright arguments]
// With --ci (the step of `npm run test:ci`) it runs on Linux where a database is configured and
// otherwise says it was skipped and succeeds; the Windows job has no database service.
// With --ci and ROSETTA_E2E_OWN_JOB=1 it is skipped too: in CI the sharded e2e jobs run the project.
// ROSETTA_E2E_DRY_RUN=1 with ROSETTA_E2E_DRY_RUN_ACK=1 prints the arguments Playwright would get
// and stops (the tests use it); without the acknowledgement it refuses.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const [, , ...args] = process.argv;
const ci = args[0] === '--ci';
const database = process.env.ROSETTA_TEST_DATABASE_URL ?? '';
const ownJob = process.env.ROSETTA_E2E_OWN_JOB === '1';

// RNF-005: "--shard=N/3" runs the spec files that tests/e2e/shards.json gives shard N, balanced by
// duration. Playwright's own --shard splits by test count in file order, which left shard 1 about
// twice as long as shard 3 (#325). tests/integration/tooling/e2e-shards.test.ts keeps the map whole.
const SHARD_PREFIX = '--shard=';

// RF-1108, #771: the run queue is one per server and every worker shares it, so the queue spec
// (tagged @queue) must not run beside other specs. The invocation that owns it runs its other tests
// first, then the spec alone in a second, serial invocation of the `queue` project, with its own
// report folder. ROSETTA_E2E_PLAYWRIGHT_CLI replaces the Playwright CLI (tests only).
const QUEUE_SPEC = 'tests/e2e/start-run-queue.spec.ts';
const QUEUE_TAG = '@queue';
const QUEUE_PROJECT = 'queue';
const QUEUE_OUTPUT = 'test-results/queue';

/** The Playwright argument lists of one run: one, or two on the run that owns the queue spec. */
function invocationsOf(passThrough, fullRun) {
  if (!fullRun && !passThrough.includes(QUEUE_SPEC)) return [['test', ...passThrough]];
  const others = passThrough.filter((arg) => arg !== QUEUE_SPEC);
  return [
    ['test', ...others, '--grep-invert', QUEUE_TAG],
    ['test', QUEUE_SPEC, '--project', QUEUE_PROJECT, '--workers=1', '--output', QUEUE_OUTPUT],
  ];
}

/** The spec files of the shard named by a --shard argument. */
async function shardSpecs(shardArgument) {
  const index = shardArgument.slice(SHARD_PREFIX.length).split('/')[0];
  const map = JSON.parse(await readFile(join('tests', 'e2e', 'shards.json'), 'utf8'));
  // An empty or unknown shard is refused: Playwright with no spec file argument runs every spec.
  const specs = Object.hasOwn(map, index) ? map[index] : undefined;
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error(`run-e2e: tests/e2e/shards.json has no spec files for shard ${index}.`);
  }
  return specs;
}

const shardArgument = args.find((arg) => arg.startsWith(SHARD_PREFIX));
const plainArgs = args.filter((arg) => arg !== shardArgument);
// A run without a shard or file arguments runs the whole project.
const fullRun = shardArgument === undefined && plainArgs.every((arg) => arg.startsWith('-'));
let passThrough = [];
let shardError;
try {
  passThrough = (ci ? plainArgs.slice(1) : plainArgs).concat(
    shardArgument === undefined ? [] : await shardSpecs(shardArgument),
  );
} catch (error) {
  shardError = error;
}

function runNode(script, scriptArgs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], { stdio: 'inherit' });
    child.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

if (shardError !== undefined) {
  process.stderr.write(`${shardError.message}\n`);
  process.exitCode = 1;
} else if (process.env.ROSETTA_E2E_DRY_RUN === '1') {
  // Both flags are needed: a stray DRY_RUN variable must not pass as a run that tested nothing.
  if (process.env.ROSETTA_E2E_DRY_RUN_ACK === '1') {
    process.stderr.write('DRY RUN, no tests run.\n');
    const plan = invocationsOf(passThrough, fullRun);
    const printed = process.env.ROSETTA_E2E_DRY_RUN_PLAN === '1' ? plan : passThrough;
    process.stdout.write(`${JSON.stringify(printed)}\n`);
  } else {
    process.stderr.write(
      'run-e2e: ROSETTA_E2E_DRY_RUN=1 also needs ROSETTA_E2E_DRY_RUN_ACK=1; refusing, no tests run.\n',
    );
    process.exitCode = 1;
  }
} else if (ci && (ownJob || process.platform !== 'linux' || database === '')) {
  const why = ownJob
    ? 'the e2e jobs of the workflow run them'
    : database === ''
      ? 'ROSETTA_TEST_DATABASE_URL is not set'
      : 'it runs on Linux only (the CI database service)';
  process.stdout.write(`End-to-end tests skipped: ${why}.\n`);
} else if (database === '') {
  process.stderr.write(
    'run-e2e: ROSETTA_TEST_DATABASE_URL is not set; point it at a disposable PostgreSQL.\n',
  );
  process.exitCode = 1;
} else {
  const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
  const playwright =
    process.env.ROSETTA_E2E_PLAYWRIGHT_CLI ?? require.resolve('@playwright/test/cli');
  const built = await runNode(vite, ['build', '--config', 'web/vite.config.ts']);
  if (built !== 0) {
    process.exitCode = built;
  } else {
    // Every invocation runs, even after a failed one; the run fails with the first failure.
    const codes = [];
    for (const invocation of invocationsOf(passThrough, fullRun)) {
      codes.push(await runNode(playwright, invocation));
    }
    process.exitCode = codes.find((code) => code !== 0) ?? 0;
  }
}
