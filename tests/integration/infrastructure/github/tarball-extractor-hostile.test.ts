import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTRACTION_LIMITS,
  extractTarball,
} from '../../../../src/infrastructure/github/tarball-extractor.js';
import {
  hostileTarball,
  plainFile,
  rawEntry,
  TOP,
  type HostileEntry,
} from '../../../support/hostile-tar.js';
import { listTree, useWritableTempRoot } from '../../../support/writable-temp-root.js';

const root = useWritableTempRoot('rosetta-extractor-hostile-');
const targetDir = (): string => join(root.path, 'files');

async function extract(entries: readonly HostileEntry[]): ReturnType<typeof extractTarball> {
  const bytes = await hostileTarball(entries);
  const body = new Response(new Uint8Array(bytes)).body ?? new ReadableStream();
  await mkdir(targetDir(), { recursive: true });
  return extractTarball(body, targetDir(), DEFAULT_EXTRACTION_LIMITS, new AbortController().signal);
}

const REFUSED_PATHS: readonly (readonly [string, string])[] = [
  ['a backslash traversal', `${TOP}/a\\..\\x`],
  ['a leading backslash', '\\x'],
  ['a UNC share', '\\\\server\\share\\x'],
  ['a drive-relative path', 'C:x'],
  ['a drive-absolute path', 'C:\\x'],
  ['a drive-absolute path with a slash', 'C:/x'],
  ['a lower-case drive letter', 'c:x'],
  ['a drive letter after a backslash', `${TOP}\\C:\\x`],
  ['a drive letter at the start with a backslash tail', 'D:\\a\\b'],
  ['a POSIX absolute path', '/abs/x'],
  ['a dot-dot segment between separators', `${TOP}/a/../../x`],
  ['a trailing dot-dot', `${TOP}/..`],
  ['a dot-dot with a trailing space', `${TOP}/.. /x`],
  ['three dots', `${TOP}/.../x`],
  ['dots and a space', `${TOP}/. ./x`],
  ['a dot-dot with a trailing space at the end', `${TOP}/a/.. `],
];

const SKIPPED_PATHS: readonly (readonly [string, string])[] = [
  ['a kernel driver file', 'drivers/net/aux.c'],
  ['a header', 'include/con.h'],
  ['a folder', 'aux/readme.txt'],
  ['a dependency', 'node_modules/nul/nul.js'],
  ['an upper-case name', 'Properties/PRN.cs'],
  ['a colon in a file name', 'docs/a:b.txt'],
  ['a device name', 'CON'],
  ['a device name in lower case', 'nul'],
  ['several extensions', 'prn.tar.gz'],
  ['a numbered port', 'COM1'],
  ['a numbered printer', 'lpt9.log'],
  ['a superscript-numbered port', 'COM¹'],
  ['a trailing dot', 'aux.'],
  ['a trailing space', 'con '],
  ['a stream', 'con:stream'],
  ['the console input', 'CONIN$'],
  ['a drive form below the top folder', 'C:x'],
  ['a device after a backslash', 'src\\COM2.txt'],
];

describe('extractTarball names Windows cannot use', () => {
  it.each(SKIPPED_PATHS)(
    'RF-122 skips an entry with %s, counts it and extracts the rest',
    async (_label, name) => {
      const result = await extract([plainFile('README.md'), rawEntry(`${TOP}/${name}`)]);

      expect(await listTree(targetDir())).toEqual(['README.md']);
      expect(result.skippedLinks).toBe(1);
    },
  );

  it('RF-122 skips a device-named folder with everything below it and keeps the other files', async () => {
    const result = await extract([
      plainFile('aux/a.txt'),
      plainFile('aux/deep/b.txt'),
      plainFile('src/ok.cs'),
    ]);

    expect(await listTree(targetDir())).toEqual(['src/ok.cs']);
    expect(result.skippedLinks).toBe(2);
  });

  it('RF-122 a skipped entry does not hide a hostile one after it', async () => {
    await expect(extract([rawEntry(`${TOP}/aux.c`), rawEntry('/abs/x')])).rejects.toMatchObject({
      code: 'RST-1906',
    });
  });
});

describe('extractTarball hostile entry names', () => {
  it.each(REFUSED_PATHS)(
    'RF-122 refuses %s with RST-1906 and writes nothing outside',
    async (_label, path) => {
      await expect(extract([plainFile('README.md'), rawEntry(path)])).rejects.toMatchObject({
        code: 'RST-1906',
      });

      expect(await readdir(root.path)).toEqual(['files']);
    },
  );

  it.each([
    `${TOP}/console.txt`,
    `${TOP}/nullable.cs`,
    `${TOP}/com10.txt`,
    `${TOP}/com.txt`,
    `${TOP}/lpt.txt`,
    `${TOP}/.config`,
    `${TOP}/a..b/x`,
    `${TOP}/..foo/x`,
    `${TOP}/x../y`,
    `${TOP}/./x`,
    `${TOP}/ CON`,
    `${TOP}/src/auxiliary/x.cs`,
  ])('RF-122 keeps the ordinary name %s', async (path) => {
    await extract([rawEntry(path)]);

    expect(await listTree(targetDir())).toHaveLength(1);
  });

  it('RF-122 does not read the stripped top folder as a device name', async () => {
    await extract([rawEntry('aux.js-3f78685/x.cs')]);

    expect(await listTree(targetDir())).toEqual(['x.cs']);
  });
});

describe('extractTarball special files', () => {
  it.each(['FIFO', 'CharacterDevice', 'BlockDevice'] as const)(
    'RF-127 skips a %s entry without creating it',
    async (type) => {
      const result = await extract([plainFile('README.md'), rawEntry(`${TOP}/pipe`, type)]);

      expect(await listTree(targetDir())).toEqual(['README.md']);
      expect(result.skippedLinks).toBe(0);
    },
  );

  it('RF-127 refuses a FIFO whose name is hostile', async () => {
    await expect(extract([rawEntry('/abs/pipe', 'FIFO')])).rejects.toMatchObject({
      code: 'RST-1906',
    });
  });
});
