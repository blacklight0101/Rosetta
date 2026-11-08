// P8-142 (DEC-227, RNF-005): the stress job of ci.yml. Runs only the test files a pull request adds
// or changes, five times each, with no retry, so a test that fails one run fails the job before it
// can hold the required checks of other pull requests:
// - Vitest files: `vitest run <files> --sequence.shuffle --sequence.seed=<seed> --repeats=4 --retry=0`,
//   the files in parallel workers, files and tests in a shuffled order; the seed is printed to replay it.
// - Playwright specs: `node scripts/run-e2e.mjs <specs> --repeat-each=5 --workers=4 --retries=0`.
//   Playwright has no shuffle option; with fullyParallel the repeats interleave on the four workers.
// Usage: ROSETTA_STRESS_FILES='["tests/unit/a.test.ts"]' node scripts/stress-tests.mjs
// ROSETTA_STRESS_SEED fixes the seed; ROSETTA_STRESS_DRY_RUN=1 prints the plan and runs nothing.
import { spawn } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlaywrightFile } from './quarantine.mjs';

const RUNS = 5;
const E2E_WORKERS = 4;

const require = createRequire(import.meta.url);
const vitestCli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const runE2e = join(dirname(fileURLToPath(import.meta.url)), 'run-e2e.mjs');

// The files the projects of vitest.config.ts include; a file outside them would end the run on
// "no test files". The test-picks job of ci.yml filters with the same shape.
const vitestIncluded =
  /^tests\/(?:(?:unit|integration|e2e)\/.+\.test\.ts|unit\/web\/.+\.test\.tsx)$/u;

/** The paths of ROSETTA_STRESS_FILES, or undefined when it is not a JSON array of strings. */
function parseFiles(text) {
  try {
    const files = JSON.parse(text ?? '');
    return Array.isArray(files) && files.every((file) => typeof file === 'string')
      ? files
      : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

/** The runs of the stress job: Vitest for the test files, Playwright for the specs. */
function planOf(files, seed) {
  const vitest = files.filter((file) => vitestIncluded.test(file));
  const specs = files.filter(isPlaywrightFile);
  const plan = [];
  if (vitest.length > 0) {
    const order = ['--sequence.shuffle', `--sequence.seed=${String(seed)}`];
    const args = ['run', ...vitest, ...order, `--repeats=${String(RUNS - 1)}`, '--retry=0'];
    plan.push({ tool: 'vitest', args });
  }
  if (specs.length > 0) {
    const repeat = [`--repeat-each=${String(RUNS)}`, `--workers=${String(E2E_WORKERS)}`];
    plan.push({ tool: 'playwright', args: [...specs, ...repeat, '--retries=0'] });
  }
  return plan;
}

function runNode(script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit' });
    child.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

const files = parseFiles(process.env.ROSETTA_STRESS_FILES);
const seed = Number(process.env.ROSETTA_STRESS_SEED ?? '') || randomInt(1, 2 ** 31);
const plan = files === undefined ? [] : planOf(files, seed);

if (files === undefined) {
  process.stderr.write('stress-tests: ROSETTA_STRESS_FILES must be a JSON array of paths.\n');
  process.exitCode = 1;
} else if (plan.length === 0) {
  process.stdout.write('No test files to stress.\n');
} else if (process.env.ROSETTA_STRESS_DRY_RUN === '1') {
  process.stdout.write(`${JSON.stringify(plan)}\n`);
} else {
  // Every run happens, even after a failed one; the job fails with the first failure.
  const codes = [];
  for (const { tool, args } of plan) {
    if (tool === 'vitest') {
      process.stdout.write(
        `Vitest shuffle seed ${String(seed)}: replay with npx vitest ${args.join(' ')}\n`,
      );
    }
    codes.push(await runNode(tool === 'vitest' ? vitestCli : runE2e, args));
  }
  process.exitCode = codes.find((code) => code !== 0) ?? 0;
}
