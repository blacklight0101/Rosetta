import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';

// DEC-29, DEC-104, RF-1300, P1-55: scripts/release-tags.sh, the step of release.yml that works out
// the image tags. It runs here as on the runner, with bash, in a temporary git repository whose
// `origin/main` is a local ref: a run from a branch gets `sha-<short>` only; a tag gets `X.Y.Z` too,
// but only when it is exactly `v` plus the version of package.json and its commit is on main.

const run = promisify(execFile);
const script = join(process.cwd(), 'scripts', 'release-tags.sh');
const image = 'ghcr.io/example/rosetta';
const root = useTempRoot('rosetta-release-tags-');

async function git(...args: string[]): Promise<string> {
  const identity = ['-c', 'user.name=ci', '-c', 'user.email=ci@example.invalid'];
  return (await run('git', [...identity, ...args], { cwd: root.path })).stdout.trim();
}

/** A repository with package.json 0.1.0 on main and one more commit on a side branch. */
async function repository(): Promise<{ main: string; side: string }> {
  await git('init', '-q', '-b', 'main');
  await writeFile(join(root.path, 'package.json'), '{ "name": "rosetta", "version": "0.1.0" }\n');
  await git('add', '--all');
  await git('commit', '-qm', 'main');
  const main = await git('rev-parse', 'HEAD');
  await git('update-ref', 'refs/remotes/origin/main', main);
  await git('checkout', '-qb', 'side');
  await writeFile(join(root.path, 'side.txt'), 'side\n');
  await git('add', '--all');
  await git('commit', '-qm', 'side');
  return { main, side: await git('rev-parse', 'HEAD') };
}

interface Outcome {
  readonly code: number;
  readonly output: string;
}

async function tags(refType: string, refName: string, sha: string): Promise<Outcome> {
  const output = join(root.path, 'github-output.txt');
  await writeFile(output, '');
  const env = {
    PATH: process.env['PATH'] ?? '',
    ...{ IMAGE: image, REF_TYPE: refType, REF_NAME: refName, GITHUB_SHA: sha },
    GITHUB_OUTPUT: output,
  };
  const code = await run('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], {
    cwd: root.path,
    env,
  }).then(
    () => 0,
    (error: unknown) =>
      typeof error === 'object' && error !== null && 'code' in error ? Number(error.code) : 1,
  );
  return { code, output: (await readFile(output, 'utf8')).trim() };
}

describe('scripts/release-tags.sh', () => {
  it('DEC-104 a run from main gets sha-<short> only', async () => {
    const { main } = await repository();

    const outcome = await tags('branch', 'main', main);

    expect(outcome.code).toBe(0);
    expect(outcome.output).toContain(`sha-tag=sha-${main.slice(0, 7)}`);
    expect(outcome.output.split('\n')).toContain(`tags=${image}:sha-${main.slice(0, 7)}`);
  });

  it('DEC-29 a tag v<package.json version> on main gets sha-<short> and X.Y.Z', async () => {
    const { main } = await repository();

    const outcome = await tags('tag', 'v0.1.0', main);

    expect(outcome.code).toBe(0);
    expect(outcome.output).toContain(`tags=${image}:sha-${main.slice(0, 7)} ${image}:0.1.0`);
  });

  it.each([
    ['another version', 'v0.2.0'],
    ['a version with two numbers', 'v0.1'],
    ['a pre-release', 'v0.1.0-rc.1'],
    ['no v in front', '0.1.0'],
    ['a v inside', 'vv0.1.0'],
  ])('DEC-29 refuses a tag with %s and writes no tags', async (_label, tag) => {
    const { main } = await repository();

    const outcome = await tags('tag', tag, main);

    expect(outcome.code).not.toBe(0);
    expect(outcome.output).toBe('');
  });

  it('DEC-29 refuses a tag whose commit is not on main and writes no tags', async () => {
    const { side } = await repository();

    const outcome = await tags('tag', 'v0.1.0', side);

    expect(outcome.code).not.toBe(0);
    expect(outcome.output).toBe('');
  });
});
