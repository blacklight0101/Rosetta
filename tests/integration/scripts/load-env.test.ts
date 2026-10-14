import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
loadEnvFileIfPresent(${JSON.stringify(envFile)});
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
