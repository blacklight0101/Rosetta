import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';

// The pre-push hook's test step (lefthook.yml): it chooses which tests a push runs. These probes
// use a real Git repository with a bare remote, and read the plan the script prints with --plan.
const run = promisify(execFile);
const script = join(process.cwd(), 'scripts', 'pre-push-tests.mjs');

interface Plan {
  readonly mode: 'none' | 'related' | 'full';
  readonly base: string | null;
  readonly steps: readonly (readonly string[])[];
  readonly reason: string;
}

type Tracking = 'upstream' | 'no-upstream' | 'no-origin';

// Git runs inside the test without the variables a hook environment sets (GIT_DIR and friends).
async function git(cwd: string, args: readonly string[]): Promise<void> {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  await run(
    'git',
    [
      '-c',
      'user.name=Rosetta',
      '-c',
      'user.email=rosetta@example.invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, env },
  );
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

// A work repository whose origin/main holds one commit; the task branch is one commit ahead with
// the given files. `upstream` tracks origin/main; `no-upstream` has no upstream; `no-origin` also
// has no origin/main, so no base can be read.
async function repository(root: string, files: readonly string[], tracking: Tracking = 'upstream') {
  const work = join(root, 'work');
  await mkdir(work);
  await git(work, ['init', '--quiet', '-b', 'main']);
  await write(join(work, 'README.md'), 'base\n');
  await git(work, ['add', '-A']);
  await git(work, ['commit', '--quiet', '-m', 'base']);
  await git(work, ['init', '--quiet', '--bare', join(root, 'remote.git')]);
  await git(work, ['remote', 'add', 'origin', join(root, 'remote.git')]);
  await git(work, ['push', '--quiet', 'origin', 'main']);
  await git(work, [
    'checkout',
    '--quiet',
    tracking === 'upstream' ? '--track' : '--no-track',
    '-b',
    'task/p1-179-probe',
    'origin/main',
  ]);
  if (tracking === 'no-origin') await git(work, ['update-ref', '-d', 'refs/remotes/origin/main']);
  for (const file of files) await write(join(work, file), 'export const value = 1;\n');
  await git(work, ['add', '-A']);
  await git(work, ['commit', '--quiet', '-m', 'change']);
  return work;
}

async function planFor(work: string): Promise<Plan> {
  const { stdout } = await run('node', [script, '--plan'], { cwd: work });
  return JSON.parse(stdout) as Plan;
}

describe('pre-push test selection', () => {
  const tmp = useTempRoot('rosetta-prepush-');

  it('RNF-005 a push that changes one source file runs only the tests related to it', async () => {
    const plan = await planFor(await repository(tmp.path, ['src/application/use-case.ts']));
    const args = plan.steps.flat();

    expect(plan.mode).toBe('related');
    expect(args).toEqual(expect.arrayContaining(['--changed', 'origin/main', '--passWithNoTests']));
  });

  it('RNF-005 a related run never includes the integration project', async () => {
    const plan = await planFor(await repository(tmp.path, ['src/application/use-case.ts']));

    expect(plan.steps.flat()).not.toContain('integration');
  });

  it('RNF-005 a documentation-only push runs the documentation consistency tests only', async () => {
    const plan = await planFor(await repository(tmp.path, ['docs/handoff-note.md']));

    expect(plan.mode).toBe('related');
    expect(plan.steps).toEqual([
      [
        'run',
        '--project',
        'unit',
        '--project',
        'integration',
        'tests/unit/docs',
        'tests/integration/docs',
      ],
    ]);
  });
});

describe('pre-push test base', () => {
  const tmp = useTempRoot('rosetta-prepush-base-');

  it('RNF-005 a new branch with no upstream takes the merge-base with origin/main as its base', async () => {
    const plan = await planFor(
      await repository(tmp.path, ['src/application/use-case.ts'], 'no-upstream'),
    );

    expect(plan.mode).toBe('related');
    expect(plan.steps.flat()).toContain('--changed');
    expect(plan.base).toMatch(/^[0-9a-f]{40}$/u);
  });

  it('RNF-005 a new branch with no origin/main to compare against falls back to the unit project', async () => {
    const plan = await planFor(
      await repository(tmp.path, ['src/application/use-case.ts'], 'no-origin'),
    );

    expect(plan).toMatchObject({ mode: 'full', steps: [['run', '--project', 'unit']] });
  });

  it.each([
    'package.json',
    'vitest.config.ts',
    'tsconfig.json',
    'lefthook.yml',
    'tests/support/temp-root.ts',
    'tests/unit/web/setup.ts',
  ])('RNF-005 a change to %s falls back to the unit project', async (file) => {
    const work = await repository(tmp.path, ['src/application/use-case.ts', file]);

    expect((await planFor(work)).mode).toBe('full');
  });

  it('RNF-005 a push that changes many files falls back to the unit project', async () => {
    const files = Array.from(
      { length: 30 },
      (_, index) => `src/application/part-${String(index)}.ts`,
    );

    expect((await planFor(await repository(tmp.path, files))).mode).toBe('full');
  });
});

describe('pre-push hook wiring', () => {
  it('RNF-005 the pre-push hook runs the test selection after the typecheck', async () => {
    const config = await readFile('lefthook.yml', 'utf8');

    expect(config).toContain('node scripts/pre-push-tests.mjs');
    expect(config).not.toContain('npx vitest run --project unit');
  });
});
