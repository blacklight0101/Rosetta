// RNF-005 / ADR-011: the test step of the pre-push hook (lefthook.yml). It runs the unit and web tests
// related to the files the push changes, the documentation consistency tests when a document changed, and
// the whole unit project when the change or the base calls for it. Integration and end-to-end tests run in
// CI (environments-and-delivery.md section 5).
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
// The documentation consistency tests read the documents; they are cheap (about 5 s), so a document change runs them.
const docTests = ['tests/unit/docs', 'tests/integration/docs'];

// Classifies one changed path: 'code' runs through Vitest's related selection, 'doc' runs the documentation
// tests, 'other' (configuration, support code, scripts, workflows, data) needs the whole unit project.
export function classify(file) {
  if (docFile.test(file)) return 'doc';
  if (sharedConfig.test(file) || configModule.test(file) || supportCode.test(file)) return 'other';
  if (testedRoots.test(file) && codeFile.test(file)) return 'code';
  return 'other';
}

const fullPlan = (base, reason) => ({
  mode: 'full',
  base,
  steps: [['run', '--project', 'unit']],
  reason,
});

const relatedStep = (base) => [
  'run',
  '--project',
  'unit',
  '--project',
  'web',
  '--changed',
  base,
  '--passWithNoTests',
];
const docStep = ['run', '--project', 'unit', '--project', 'integration', ...docTests];

// Decides what the push runs. `base` is the commit or ref the change is measured from, or null when none can
// be read; `changed` lists the paths the push changes against it, or null when Git cannot tell.
export function planPrePushTests({ base, changed }) {
  if (base === null) return fullPlan(base, 'no base to compare with: the whole unit project runs');
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
  const steps = [];
  if (kinds.includes('code')) steps.push(relatedStep(base));
  if (kinds.includes('doc')) steps.push(docStep);
  if (steps.length === 0) return { mode: 'none', base, steps: [], reason: 'nothing to test' };
  return {
    mode: 'related',
    base,
    steps,
    reason:
      'the unit and web tests related to the change run; documentation tests run when a document changed',
  };
}

// Runs each step of the plan in order with its own Vitest run; the first failing step fails the push.
// Vitest runs through its own entry point: no shell, so the same command works on Windows and Linux.
export async function runPlan(plan, { spawnChild }) {
  const vitest = join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
  for (const step of plan.steps) {
    const code = await spawnChild(process.execPath, [vitest, ...step]);
    if (code !== 0) return code;
  }
  return 0;
}

async function git(args) {
  const { stdout } = await execute('git', args);
  return stdout.trim();
}

// The integration branch a new branch is measured from: origin/develop (DEC-175), or origin/main when develop
// does not exist.
async function trunkRef() {
  try {
    await git(['rev-parse', '--verify', '--quiet', 'origin/develop']);
    return 'origin/develop';
  } catch {
    return 'origin/main';
  }
}

// The base of the push: the upstream branch when there is one; otherwise the merge-base with the trunk (a new
// branch); otherwise null.
async function baseOf() {
  try {
    return await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  } catch {
    // no upstream: a new branch
  }
  try {
    return await git(['merge-base', await trunkRef(), 'HEAD']);
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
  const base = await baseOf();
  const changed = base === null ? null : await changedSince(base);
  return planPrePushTests({ base, changed });
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
