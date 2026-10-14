import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// RF-402: the manual live check reads the owner's .env itself, so `npm run live:openai` needs no
// flags; a variable the environment already sets keeps its value.

const helper = pathToFileURL(resolve(import.meta.dirname, '../../../scripts/load-env.mjs')).href;
const script = resolve(import.meta.dirname, '../../../scripts/openai-live-check.mjs');
const probe = 'ROSETTA_LOAD_PROBE';

const folder = await mkdtemp(join(tmpdir(), 'rosetta-load-env-'));
afterAll(() => rm(folder, { recursive: true, force: true }));

interface Outcome {
  readonly status: number;
  readonly stdout: string;
}

function runNode(args: readonly string[], env: NodeJS.ProcessEnv): Promise<Outcome> {
  return new Promise((resolveRun) => {
    execFile(process.execPath, args, { env }, (error, stdout) => {
      const status = typeof error?.code === 'number' ? error.code : 0;
      resolveRun({ status, stdout });
    });
  });
}

async function loadedValue(envFile: string, preset?: string): Promise<string> {
  const code = `import { loadEnvFileIfPresent } from ${JSON.stringify(helper)};
await loadEnvFileIfPresent(${JSON.stringify(envFile)});
process.stdout.write(process.env.${probe} ?? 'unset');`;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== probe));
  if (preset !== undefined) env[probe] = preset;
  return (await runNode(['--input-type=module', '-e', code], env)).stdout;
}

describe('RF-402 the .env file of the repository', () => {
  it('RF-402 fills a variable the environment does not set', async () => {
    const envFile = join(folder, 'fills.env');
    await writeFile(envFile, `${probe}=from-file\n`);

    expect(await loadedValue(envFile)).toBe('from-file');
  });

  it('RF-402 keeps a variable the environment already sets', async () => {
    const envFile = join(folder, 'keeps.env');
    await writeFile(envFile, `${probe}=from-file\n`);

    expect(await loadedValue(envFile, 'from-environment')).toBe('from-environment');
  });

  it('RF-402 a missing file is not an error', async () => {
    expect(await loadedValue(join(folder, 'absent.env'))).toBe('unset');
  });

  it('RF-402 the live check asks for a key without any flag', async () => {
    const env = { ...process.env, OPENAI_API_KEY: '' };
    const result = await runNode([script, 'gpt-5-nano'], env);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('Set OPENAI_API_KEY in the environment first.');
  });
});

describe('RF-402 the live check reads the key from the .env beside it', () => {
  it('RF-402 a key in .env reaches the check without any flag, and is never printed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rosetta-live-root-'));
    await mkdir(join(root, 'scripts'));
    await copyFile(script, join(root, 'scripts', 'openai-live-check.mjs'));
    await copyFile(
      resolve(import.meta.dirname, '../../../scripts/load-env.mjs'),
      join(root, 'scripts', 'load-env.mjs'),
    );
    // Built from pieces so no whole key literal sits in the source.
    const fakeKey = ['sk', 'test', 'p191', 'not-a-real-key'].join('-');
    await writeFile(join(root, '.env'), `OPENAI_API_KEY=${fakeKey}\n`);
    try {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => key !== 'OPENAI_API_KEY' && key !== 'ROSETTA_TEST',
        ),
      );
      const result = await runNode(
        [join(root, 'scripts', 'openai-live-check.mjs'), 'gpt-5-nano'],
        env,
      );

      expect(result.stdout).not.toContain('Set OPENAI_API_KEY');
      expect(result.stdout).not.toContain(fakeKey);
      expect(result.status).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
