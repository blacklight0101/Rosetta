import { describe, expect, it } from 'vitest';
import { type BashLookup, resolveBash } from '../../support/bash.js';

// P2-56: the tests run workflow steps with bash. On Windows `bash` on PATH can be WSL's
// (C:\Windows\System32\bash.exe), which cannot run the steps, so the helper picks Git Bash next to
// the git on PATH, or Git's default install, and never a bash of System32 or WindowsApps.

const gitBin = 'C:\\Program Files\\Git\\bin\\bash.exe';

/** A lookup over a fixed set of existing files, on the given platform and environment. */
function lookupOf(
  files: readonly string[],
  env: Readonly<Record<string, string>>,
  platform: NodeJS.Platform = 'win32',
): BashLookup {
  const present = new Set(files.map((file) => file.toLowerCase()));
  return { platform, env, exists: (path) => present.has(path.toLowerCase()) };
}

describe('P2-56 the test helper runs steps with Git Bash on Windows', () => {
  it('P2-56 uses bash from PATH on other platforms', () => {
    const lookup = lookupOf([], { PATH: '/usr/bin' }, 'linux');
    expect(resolveBash(lookup)).toBe('bash');
  });

  it('P2-56 picks the Git Bash next to git.exe, not the WSL bash that comes first on PATH', () => {
    const lookup = lookupOf(
      ['C:\\Windows\\System32\\bash.exe', 'C:\\Program Files\\Git\\cmd\\git.exe', gitBin],
      { PATH: 'C:\\Windows\\System32;C:\\Program Files\\Git\\cmd' },
    );
    expect(resolveBash(lookup)).toBe(gitBin);
  });

  it('P2-56 derives the Git root from a git.exe in mingw64\\bin as well', () => {
    const lookup = lookupOf(['C:\\Program Files\\Git\\mingw64\\bin\\git.exe', gitBin], {
      PATH: 'C:\\Program Files\\Git\\mingw64\\bin',
    });
    expect(resolveBash(lookup)).toBe(gitBin);
  });

  it('P2-56 falls back to the default Git install when git is not on PATH', () => {
    const lookup = lookupOf([gitBin], {
      PATH: 'C:\\Windows\\System32',
      ProgramFiles: 'C:\\Program Files',
    });
    expect(resolveBash(lookup)).toBe(gitBin);
  });

  it('P2-56 never returns the System32 or WindowsApps bash', () => {
    const lookup = lookupOf(
      [
        'C:\\Windows\\System32\\bash.exe',
        'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe',
      ],
      { PATH: 'C:\\Windows\\System32;C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps' },
    );
    expect(() => resolveBash(lookup)).toThrow(/Git for Windows/u);
  });

  it('P2-56 stops with a message naming the fix when no Git Bash exists', () => {
    const lookup = lookupOf(['C:\\Windows\\System32\\bash.exe'], {
      PATH: 'C:\\Windows\\System32',
      ProgramFiles: 'C:\\Program Files',
    });
    expect(() => resolveBash(lookup)).toThrow(/Install Git for Windows.*bin folder.*PATH/su);
  });
});
