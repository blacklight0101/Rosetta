// RNF-005 / ADR-011: the test step of the pre-push hook (lefthook.yml). It runs the unit and integration
// tests related to the files the push changes against the upstream branch, and the whole unit project when
// the change or the base calls for it. CI runs every test (environments-and-delivery.md section 5).
// Usage: node scripts/pre-push-tests.mjs [--plan]   (--plan prints the plan as JSON and runs nothing)
import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execute = promisify(execFile);

// Above this many changed files the related selection is no longer cheaper than the whole unit project.
const maxRelatedFiles = 25;
// A change to any of these can alter every test, so the hook runs the whole unit project.
const sharedConfig =
  /^(?:package(?:-lock)?\.json|tsconfig[^/]*\.json|lefthook\.yml|knip\.json|\.dependency-cruiser\.cjs)$/u;
const configModule = /(?:^|\/)[\w-]+\.config\.(?:ts|mjs|cjs|js)$/u;
const supportCode = /^tests\/support\/|(?:^|\/)setup\.ts$/u;
const testedRoots = /^(?:src|web\/src|tests\/unit|tests\/integration|tests\/e2e)\//u;
const codeFile = /\.(?:ts|tsx|mjs|cjs|js)$/u;
const docFile = /^docs\/|\.md$/u;

// Classifies one changed path: 'code' runs through Vitest's related selection, 'doc' runs nothing,
// 'other' (configuration, support code, scripts, workflows, data) needs the whole unit project.
export function classify(file) {
  if (docFile.test(file)) return 'doc';
  if (sharedConfig.test(file) || configModule.test(file) || supportCode.test(file)) return 'other';
  if (testedRoots.test(file) && codeFile.test(file)) return 'code';
  return 'other';
}

const fullPlan = (base, reason) => ({
  mode: 'full',
  base,
  args: ['run', '--project', 'unit'],
  reason,
});

// Decides what the push runs. `base` is the upstream branch or null; `changed` lists the paths the
// push changes against it, or null when Git cannot tell.
export function planPrePushTests({ base, changed }) {
  if (base === null) return fullPlan(base, 'no upstream branch: the whole unit project runs');
  if (changed === null)
    return fullPlan(base, 'the changed files are unknown: the whole unit project runs');
  if (changed.length > maxRelatedFiles) {
    return fullPlan(
      base,
      `more than ${maxRelatedFiles} files changed: the whole unit project runs`,
    );
  }
  const kinds = changed.map(classify);
  if (kinds.includes('other')) {
    return fullPlan(
      base,
      'configuration, test support or other files changed: the whole unit project runs',
    );
  }
  if (!kinds.includes('code'))
    return { mode: 'none', base, args: [], reason: 'no source change: no tests run' };
  return {
    mode: 'related',
    base,
    args: [
      'run',
      '--project',
      'unit',
      '--project',
      'integration',
      '--project',
      'web',
      '--changed',
      base,
      '--passWithNoTests',
    ],
    reason: 'the unit and integration tests related to the change run',
  };
}

async function git(args) {
  const { stdout } = await execute('git', args);
  return stdout;
}

// The upstream branch of the current branch, or null when it has none (a new branch).
async function upstreamOf() {
  try {
    return (await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])).trim();
  } catch {
    return null;
  }
}

async function changedSince(base) {
  try {
    const listing = await git(['diff', '--name-only', `${base}...HEAD`]);
    return listing.split('\n').filter((line) => line.length > 0);
  } catch {
    return null;
  }
}

async function currentPlan() {
  const base = await upstreamOf();
  const changed = base === null ? null : await changedSince(base);
  return planPrePushTests({ base, changed });
}

// Runs Vitest through its own entry point: no shell, so the same command works on Windows and Linux.
export async function runPlan(plan, { spawnChild }) {
  if (plan.mode === 'none') return 0;
  const vitest = join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
  return spawnChild(process.execPath, [vitest, ...plan.args]);
}

function spawnAndWait(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main(argv) {
  const plan = await currentPlan();
  if (argv.includes('--plan')) {
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    return 0;
  }
  process.stdout.write(`pre-push tests: ${plan.reason}\n`);
  return runPlan(plan, { spawnChild: spawnAndWait });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
