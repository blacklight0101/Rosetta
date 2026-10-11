import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';

// Worktrees share one .git/hooks folder, so agents must install without lefthook's postinstall
// (lefthook.yml, environments-and-delivery.md section 5). These tests pin down which install
// environment lefthook actually honours, using a throwaway repository as the install target.
const run = promisify(execFile);
const postinstall = join(process.cwd(), 'node_modules', 'lefthook', 'postinstall.js');

function cleanEnv(extra: Record<string, string>, target: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'CI' && key !== 'LEFTHOOK' && !key.startsWith('GIT_')) env[key] = value;
  }
  return { ...env, ...extra, INIT_CWD: target };
}

async function hooksAfterPostinstall(target: string, extra: Record<string, string>) {
  await run('git', ['init', '--quiet', target], { env: cleanEnv({}, target) });
  await run('node', [postinstall], { env: cleanEnv(extra, target) });
  const hooks = await readdir(join(target, '.git', 'hooks'));
  return hooks.filter((name) => !name.endsWith('.sample'));
}

describe('lefthook install for agents and CI', () => {
  const tmp = useTempRoot('rosetta-lefthook-');

  it('RNF-005 LEFTHOOK=0 alone does not stop the lefthook postinstall from writing hooks', async () => {
    expect(await hooksAfterPostinstall(tmp.path, { LEFTHOOK: '0' })).not.toEqual([]);
  });

  it('RNF-005 CI=true makes the lefthook postinstall skip writing hooks', async () => {
    expect(await hooksAfterPostinstall(tmp.path, { CI: 'true' })).toEqual([]);
  });

  it('RNF-005 only lefthook, fsevents and the grammar package have install scripts', async () => {
    const lock: unknown = JSON.parse(await readFile('package-lock.json', 'utf8'));
    const packages =
      typeof lock === 'object' && lock !== null && 'packages' in lock ? lock.packages : {};
    const withScripts = Object.entries(packages ?? {})
      .filter(
        ([, entry]) => typeof entry === 'object' && entry !== null && 'hasInstallScript' in entry,
      )
      .map(([path]) => path);

    // tree-sitter-c-sharp runs node-gyp-build, which finds its shipped prebuilds and compiles nothing;
    // Rosetta loads the WebAssembly grammar instead and never needs the native addon (ADR-004).
    expect(withScripts.sort()).toEqual([
      'node_modules/fsevents',
      'node_modules/lefthook',
      'node_modules/tree-sitter-c-sharp',
    ]);
  });

  it('RNF-005 lefthook.yml tells agents to install with npm ci --ignore-scripts, not LEFTHOOK=0', async () => {
    const config = await readFile('lefthook.yml', 'utf8');

    expect(config).toContain('npm ci --ignore-scripts');
    expect(config).not.toContain('LEFTHOOK=0 npm ci');
  });
});
