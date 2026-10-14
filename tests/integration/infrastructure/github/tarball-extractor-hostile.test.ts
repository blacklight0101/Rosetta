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
  ['a drive letter below the top folder', `${TOP}/C:x`],
  ['a drive letter after a backslash', `${TOP}\\C:\\x`],
  ['a POSIX absolute path', '/abs/x'],
  ['a dot-dot segment between separators', `${TOP}/a/../../x`],
  ['a trailing dot-dot', `${TOP}/..`],
  ['a device name', `${TOP}/CON`],
  ['a device name in lower case', `${TOP}/nul`],
  ['a device name with an extension', `${TOP}/nul.txt`],
  ['a device name with several extensions', `${TOP}/prn.tar.gz`],
  ['a numbered port device', `${TOP}/COM1`],
  ['a numbered printer device', `${TOP}/lpt9.log`],
  ['a superscript-numbered port', `${TOP}/COM\u00B9`],
  ['a device name with a trailing dot', `${TOP}/aux.`],
  ['a device name with a trailing space', `${TOP}/con `],
  ['a device name with a colon stream', `${TOP}/con:stream`],
  ['a device name in a folder', `${TOP}/src/NUL/x.cs`],
  ['a device name after a backslash', `${TOP}\\src\\COM2.txt`],
  ['the console input device', `${TOP}/CONIN$`],
  ['a dot-dot with a trailing space', `${TOP}/.. /x`],
  ['three dots', `${TOP}/.../x`],
  ['dots and a space', `${TOP}/. ./x`],
  ['a dot-dot with a trailing space at the end', `${TOP}/a/.. `],
];

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
