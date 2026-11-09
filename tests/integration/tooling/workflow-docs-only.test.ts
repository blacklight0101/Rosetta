import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { bashCommand } from '../../support/bash.js';
import { ciJob, runLines } from '../../support/workflow-files.js';

// The documentation-only path of environments-and-delivery.md section 6: a `changes` job decides
// whether a pull request touches code; the heavy steps (never whole jobs, so every required check
// keeps its name) run only when it does, and the Linux tests job still checks the documents.

const run = promisify(execFile);
// Fail closed: the heavy steps run unless the output is exactly 'false'.
const code = "needs.changes.outputs.code != 'false'";
const docsOnlyOnLinux = "runner.os == 'Linux' && needs.changes.outputs.code == 'false'";

/** The shell script of the `changes` job, as it runs on the runner. */
async function classifyScript(): Promise<string> {
  const lines = (await ciJob('changes')).split('\n');
  const start = lines.findIndex((line) => line.includes('id: classify'));
  // The first entry is the block indicator of `run: |`.
  return runLines(lines.slice(start)).slice(1).join('\n');
}

/** The steps of a job: each starts at a `      - ` line. */
async function steps(id: string): Promise<string[]> {
  return (await ciJob(id)).split(/\n(?= {6}- )/u).slice(1);
}

async function git(root: string, ...args: string[]): Promise<string> {
  return (await run('git', args, { cwd: root })).stdout.trim();
}

/** Writes each path, or moves it with git mv for an "old -> new" entry, and commits. */
async function commitFiles(root: string, paths: readonly string[], mark = ''): Promise<string> {
  for (const entry of paths) {
    const [from = '', to] = entry.split(' -> ');
    await mkdir(dirname(join(root, to ?? from)), { recursive: true });
    if (to === undefined) await writeFile(join(root, from), `${from}${mark}\n`);
    else await git(root, 'mv', from, to);
  }
  await git(root, 'add', '--all');
  await git(
    root,
    '-c',
    'user.name=ci',
    '-c',
    'user.email=ci@example.invalid',
    'commit',
    '-qm',
    'c',
  );
  return git(root, 'rev-parse', 'HEAD');
}

const baseFiles = ['README.md', 'src/main.ts', 'prompts/reader/area.v1.md', 'scripts/run-e2e.mjs'];

interface Shape {
  /** Files the base branch changes after the pull request branched off. */
  readonly baseMoved?: readonly string[];
  /** false: HEAD is the pull request's own commit, not GitHub's merge commit of it. */
  readonly merge?: boolean;
}

/** The base branch, the pull request branch `pr` (not `head`, which is HEAD on a case-insensitive disk) that changes `changed`, and their merge. */
async function pullRequest(
  origin: string,
  changed: readonly string[],
  shape: Shape,
): Promise<void> {
  await git(origin, 'init', '-q', '-b', 'base');
  await commitFiles(origin, baseFiles);
  await git(origin, 'checkout', '-q', '-b', 'pr');
  await commitFiles(origin, changed, ' (changed)');
  await git(origin, 'checkout', '-q', 'base');
  if ((shape.baseMoved ?? []).length > 0) await commitFiles(origin, shape.baseMoved ?? [], ' (b)');
  if (shape.merge === false) return;
  const identity = ['-c', 'user.name=ci', '-c', 'user.email=ci@example.invalid'];
  await git(origin, ...identity, 'merge', '-q', '--no-ff', '-m', 'merge', 'pr');
}

/**
 * Runs the script of the changes job on a pull request that changes `changed`, as the runner does
 * (DEC-227): on GitHub's merge commit of the head into the base, in a clone that holds only that
 * commit and its parents (`fetch-depth: 2`).
 */
async function classify(
  root: string,
  event: string,
  changed: readonly string[],
  shape: Shape = {},
): Promise<string> {
  const origin = join(root, 'origin');
  const clone = join(root, 'clone');
  await mkdir(origin);
  await pullRequest(origin, changed, shape);
  const url = pathToFileURL(origin).href;
  const branch = shape.merge === false ? 'pr' : 'base';
  await git(root, 'clone', '-q', '--depth', '2', '--branch', branch, url, clone);
  const output = join(root, 'github-output.txt');
  await writeFile(output, '');
  const shell = await bashCommand();
  await run(shell, ['-eo', 'pipefail', '-c', await classifyScript()], {
    cwd: clone,
    env: { ...process.env, EVENT: event, GITHUB_OUTPUT: output },
  });
  return (await readFile(output, 'utf8')).trim();
}

/** Test files that open a path under the repository's docs/ folder. */
async function testsReadingDocs(): Promise<string[]> {
  const files = await readdir(join(process.cwd(), 'tests'), { recursive: true });
  const reads = /(readFile|readdir|read|resolve|join|URL)\(.*['`"](\.\.\/)*docs\//u;
  const tests = files
    .map((name) => name.replaceAll('\\', '/'))
    .filter((file) => /\.test\.tsx?$/u.test(file));
  const texts = await Promise.all(
    tests.map((file) => readFile(join(process.cwd(), 'tests', file), 'utf8')),
  );
  return tests
    .filter((_, i) => (texts[i] ?? '').split('\n').some((line) => reads.test(line)))
    .map((file) => `tests/${file}`);
}

async function exists(path: string): Promise<boolean> {
  return readFile(join(process.cwd(), path)).then(
    () => true,
    async () => readdir(join(process.cwd(), path)).then(() => true),
  );
}

describe('GitHub Actions workflows: the changes job', () => {
  it('RNF-001 DEC-227 uses plain git on the merge commit and its parents only, no third-party action', async () => {
    const job = await ciJob('changes');
    const uses = job.split('\n').filter((line) => line.includes('uses:'));

    expect(job).toMatch(/^ {10}fetch-depth: 2$/mu);
    expect(uses).toHaveLength(1);
    expect(uses[0]).toContain('uses: actions/checkout@');
    expect(job).toContain('code: ${{ steps.classify.outputs.code }}');
    expect(job).toContain("git diff --name-only --no-renames 'HEAD^1' HEAD");
    expect(job).not.toContain('BASE_SHA');
  });
});

describe('GitHub Actions workflows: the changes script', () => {
  const repo = useTempRoot('rosetta-changes-');

  // The runner's shell is bash on Linux; on Windows `bash` may be WSL, so the Linux jobs run this.
  it.skipIf(process.platform === 'win32').each([
    ['pull_request', ['docs/guide.md', 'README.md', 'docs/design/tokens.css'], 'code=false'],
    ['pull_request', ['docs/guide.md', 'src/notes.md'], 'code=true'],
    ['pull_request', ['tests/fixtures/notes.md'], 'code=true'],
    ['pull_request', ['prompts/reader/area.v2.md'], 'code=true'],
    ['pull_request', ['docs/guide.md', 'package.json'], 'code=true'],
    ['push', ['docs/guide.md'], 'code=true'],
    // A rename lists both paths, so moving code or a prompt into documentation is still code.
    ['pull_request', ['src/main.ts -> docs/main.md'], 'code=true'],
    ['pull_request', ['prompts/reader/area.v1.md -> docs/archive/area.v1.md'], 'code=true'],
    ['pull_request', ['scripts/run-e2e.mjs -> scripts/run-e2e.md'], 'code=true'],
    // Documentation is docs/ and top-level Markdown only; Markdown elsewhere is code.
    ['pull_request', ['templates/report.md'], 'code=true'],
  ] as const)('RNF-001 a %s that changes %j sets %s', async (event, changed, expected) => {
    expect(await classify(repo.path, event, changed)).toBe(expected);
  });

  // What the pull request changes, not what its base gained after it branched off (as base...head).
  it.skipIf(process.platform === 'win32')(
    'RNF-001 DEC-227 a pull request that changes only docs sets code=false while its base gained code',
    async () => {
      const shape = { baseMoved: ['src/other.ts', 'package.json'] };

      expect(await classify(repo.path, 'pull_request', ['docs/guide.md'], shape)).toBe(
        'code=false',
      );
    },
  );

  it.skipIf(process.platform === 'win32')(
    'RNF-001 DEC-227 a pull request whose HEAD is not a merge commit fails closed with code=true',
    async () => {
      const shape = { merge: false };

      expect(await classify(repo.path, 'pull_request', ['docs/guide.md'], shape)).toBe('code=true');
    },
  );
});

describe('GitHub Actions workflows: documentation-only gating', () => {
  it.each(['tests-shard', 'gates', 'e2e-shard', 'image', 'compose-smoke'])(
    'RNF-001 job %s needs the changes job and has no job-level condition',
    async (id) => {
      const job = await ciJob(id);

      expect(job).toMatch(/^ {4}needs: changes$/mu);
      expect(job).not.toMatch(/^ {4}if:/mu);
    },
  );

  it('RNF-001 the tests job needs the changes job and the shards and has no job-level condition', async () => {
    const job = await ciJob('tests');

    expect(job).toMatch(/^ {4}needs: \[changes, tests-shard\]$/mu);
    expect(job).not.toMatch(/^ {4}if:/mu);
  });

  it.each(['gates', 'e2e-shard', 'image', 'compose-smoke'])(
    'RNF-001 every step of %s but the notice and the failure log runs only for code',
    async (id) => {
      const ungated = (await steps(id)).filter(
        (step) =>
          !step.includes(code) &&
          !step.includes('if: failure()') &&
          !step.includes("code == 'false'"),
      );

      expect(ungated).toEqual([]);
    },
  );

  it('RNF-001 every condition fails closed: only an output of exactly false skips work', async () => {
    const jobsText = await Promise.all(
      ['tests-shard', 'tests', 'gates', 'e2e-shard', 'image', 'compose-smoke'].map(ciJob),
    );
    const cleanup = (await steps('compose-smoke')).find((step) => step.includes('down -v')) ?? '';

    expect(jobsText.join('\n')).not.toMatch(/outputs\.code [!=]= 'true'/u);
    expect(cleanup).toContain(`if: always() && ${code}`);
  });

  it('RNF-001 the e2e check stays green when the shards ran with their steps skipped', async () => {
    const job = await ciJob('e2e');

    expect(job).toContain('if: always()');
    expect(job).toContain('RESULT: ${{ needs.e2e-shard.result }}');
    expect(job).toContain('test "$RESULT" = success');
  });
});

describe('GitHub Actions workflows: documentation-only checks', () => {
  it('RNF-001 the tests job runs the tests only for code and checks the documents otherwise', async () => {
    const all = await steps('tests');
    const named = (text: string): string => all.find((step) => step.includes(text)) ?? '';

    expect(named('run: npm run test:merge')).toContain(code);
    expect(named('run: npm run format:check')).toContain(docsOnlyOnLinux);
    expect(named('npx vitest run')).toContain(docsOnlyOnLinux);
  });

  it('RNF-001 the verify aggregate runs for every change, so a skipped job cannot hide a failure', async () => {
    const job = await ciJob('verify');

    expect(job).toContain('if: always()');
    expect(job).not.toContain("outputs.code == 'false'");
  });

  it(
    'RNF-001 the documentation-only tests include every test that reads the repository documents',
    { timeout: 30_000 },
    async () => {
      const step = (await steps('tests')).find((text) => text.includes('npx vitest run')) ?? '';
      const listed = [...step.matchAll(/^\s+(tests\/\S+)$/gmu)].map((match) => match[1] ?? '');
      const readers = await testsReadingDocs();

      expect(listed).toContain('tests/integration/docs');
      expect(readers.length).toBeGreaterThan(0);
      for (const file of readers) {
        expect(listed.some((entry) => file === entry || file.startsWith(`${entry}/`))).toBe(true);
      }
      for (const entry of listed) await expect(exists(entry)).resolves.toBe(true);
    },
  );
});
