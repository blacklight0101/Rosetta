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
    process.stdout.write(`${JSON.stringify(passThrough)}\n`);
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
  const playwright = require.resolve('@playwright/test/cli');
  const built = await runNode(vite, ['build', '--config', 'web/vite.config.ts']);
  process.exitCode = built === 0 ? await runNode(playwright, ['test', ...passThrough]) : built;
}
