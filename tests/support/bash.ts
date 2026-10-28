import { stat } from 'node:fs/promises';
import { win32 } from 'node:path';

// P2-56: the tests run workflow steps with bash. On Windows the `bash` on PATH can be WSL's
// (C:\Windows\System32\bash.exe), which cannot run them, so the tests use Git Bash: the bash.exe of
// the Git that is on PATH (its root is the folder above cmd, bin or mingw64\bin), then Git's default
// installs. A bash of System32 or WindowsApps is never used. Elsewhere the tests use `bash`.

/** What the helper may ask of the host: the platform, the environment and whether a file exists. */
export interface BashLookup {
  readonly platform: NodeJS.Platform;
  readonly env: Readonly<Record<string, string | undefined>>;
  exists(path: string): Promise<boolean>;
}

const wslOrStoreBash = /\\(?:system32|windowsapps)\\/iu;

/** The root of a Git install, from the folder that holds its git.exe. */
function gitRootOf(gitDir: string): string {
  const name = win32.basename(gitDir).toLowerCase();
  if (name !== 'cmd' && name !== 'bin') return gitDir;
  const parent = win32.dirname(gitDir);
  return win32.basename(parent).toLowerCase() === 'mingw64' ? win32.dirname(parent) : parent;
}

/** The folders on PATH that hold a git.exe, in PATH order. */
async function gitFoldersOf(lookup: BashLookup): Promise<string[]> {
  const pathValue = lookup.env['PATH'] ?? lookup.env['Path'] ?? '';
  const folders = pathValue.split(win32.delimiter).filter((dir) => dir !== '');
  const present = await Promise.all(
    folders.map((dir) => lookup.exists(win32.join(dir, 'git.exe'))),
  );
  return folders.filter((_, index) => present[index] === true);
}

/** The bash.exe candidates in the order they are tried, without any System32 or WindowsApps one. */
async function candidatesOf(lookup: BashLookup): Promise<string[]> {
  const fromGit = (await gitFoldersOf(lookup)).map((dir) =>
    win32.join(gitRootOf(dir), 'bin', 'bash.exe'),
  );
  const installRoots = [
    lookup.env['ProgramW6432'],
    lookup.env['ProgramFiles'],
    lookup.env['ProgramFiles(x86)'],
  ];
  const fromInstalls = installRoots
    .filter((root): root is string => root !== undefined && root !== '')
    .map((root) => win32.join(root, 'Git', 'bin', 'bash.exe'));
  const localAppData = lookup.env['LOCALAPPDATA'];
  const fromUser =
    localAppData === undefined || localAppData === ''
      ? []
      : [win32.join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe')];
  return [...new Set([...fromGit, ...fromInstalls, ...fromUser])].filter(
    (path) => !wslOrStoreBash.test(path),
  );
}

/**
 * The bash that runs workflow steps: `bash` off Windows; on Windows the first Git Bash that exists.
 * Rejects with the fix when Windows has no Git Bash, so the tests stop at once instead of running
 * WSL's bash.
 */
export async function resolveBash(lookup: BashLookup): Promise<string> {
  if (lookup.platform !== 'win32') return 'bash';
  const candidates = await candidatesOf(lookup);
  const flags = await Promise.all(candidates.map((path) => lookup.exists(path)));
  const found = candidates.find((_, index) => flags[index] === true);
  if (found !== undefined) return found;
  const looked = candidates.length === 0 ? 'none' : candidates.join(', ');
  throw new Error(
    `No Git Bash was found for the tests. On Windows the bash on PATH can be WSL's, which cannot run ` +
      `the workflow steps. Install Git for Windows (https://git-scm.com/download/win), or put its bin ` +
      `folder (for example C:\\Program Files\\Git\\bin) first on PATH, and run the tests again. ` +
      `Looked at: ${looked}.`,
  );
}

/** The lookup of the machine the tests run on. */
function hostBashLookup(): BashLookup {
  return {
    platform: process.platform,
    env: process.env,
    exists: (path) =>
      stat(path).then(
        (info) => info.isFile(),
        () => false,
      ),
  };
}

/** The bash command the tests spawn on this machine. */
export function bashCommand(): Promise<string> {
  return resolveBash(hostBashLookup());
}
