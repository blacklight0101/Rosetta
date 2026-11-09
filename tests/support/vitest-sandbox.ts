import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// P8-142 (DEC-227): a throwaway project folder for the tests of the quarantine and the stress run.
// Its own vitest.config.mjs runs the files under tests/ with Vitest's globals, so the fixture tests
// import nothing; with `quarantine` set it loads the repository's quarantine setup file.

const quarantineSetup = join(process.cwd(), 'tests', 'support', 'quarantine-setup.ts');

export interface Sandbox {
  readonly root: string;
  remove(): Promise<void>;
}

/** Writes the files (path relative to the folder: content) and a Vitest configuration. */
export async function makeSandbox(
  files: Readonly<Record<string, string>>,
  options: { readonly quarantine: boolean },
): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), 'rosetta-p8142-'));
  const setupFiles = options.quarantine ? [quarantineSetup] : [];
  const config = { test: { globals: true, include: ['tests/**/*.test.ts'], setupFiles } };
  const all = { ...files, 'vitest.config.mjs': `export default ${JSON.stringify(config)};\n` };
  for (const [path, content] of Object.entries(all)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content, 'utf8');
  }
  return {
    root,
    remove: () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}

export interface NodeRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** The environment of a child run without the variables of the Vitest run that starts it. */
export function childEnv(extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST')),
  );
  return { ...env, ...extra };
}

/** Runs a Node.js script to its end and returns its exit code and output, whatever the code. */
export function runNode(
  script: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
): Promise<NodeRun> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [script, ...args],
      { cwd: options.cwd, env: options.env, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

/** The Vitest command line of the repository, for a run in a sandbox. */
export const vitestCli = join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
