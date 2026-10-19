import { describe, expect, it } from 'vitest';
import { extractZip, targetExists, targetOf } from '../../../support/zip-extract-harness.js';
import { buildRawNameZip, buildZip, patchCentral } from '../../../support/zip-fixtures.js';
import { listTree, useWritableTempRoot } from '../../../support/writable-temp-root.js';

const root = useWritableTempRoot('rosetta-zip-hostile-');

const REFUSED_NAMES: readonly (readonly [string, string])[] = [
  ['a dot-dot segment', '../a'],
  ['a dot-dot segment in the middle', 'p/../../a'],
  ['a POSIX absolute path', '/etc/x'],
  ['a drive-absolute path', 'C:\\x'],
  ['a drive-absolute path with a slash', 'C:/x'],
  ['a drive-relative path', 'C:x'],
  ['a backslash traversal', 'a\\..\\b'],
  ['a leading backslash', '\\x'],
  ['a UNC share', '\\\\server\\share\\x'],
  ['a NUL character', 'p/a\u0000b'],
  ['dots and spaces', 'p/. ./x'],
  ['a dot-dot directory entry', '../d/'],
];

describe('YauzlZipExtractor unsafe entry names', () => {
  it.each(REFUSED_NAMES)(
    'RF-129 stops with RST-1913 for %s and leaves no folder',
    async (_label, name) => {
      const zip = await buildRawNameZip([
        { name: 'ok/fine.txt', data: 'fine' },
        { name, data: 'x', directory: name.endsWith('/') },
      ]);

      await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1913' });
      expect(await targetExists(root.path)).toBe(false);
    },
  );
});

const SKIPPED_NAMES: readonly (readonly [string, string])[] = [
  ['a kernel driver file', 'drivers/net/aux.c'],
  ['a header', 'include/con.h'],
  ['a folder', 'aux/readme.txt'],
  ['an upper-case name', 'Properties/PRN.cs'],
  ['a colon in a file name', 'docs/a:b.txt'],
  ['a device name', 'CON'],
  ['a numbered port', 'COM1'],
  ['a trailing dot', 'aux.'],
  ['a stream', 'con:stream'],
];

describe('YauzlZipExtractor names Windows cannot write', () => {
  it.each(SKIPPED_NAMES)(
    'RF-129 skips an entry with %s, counts it and extracts the rest',
    async (_label, name) => {
      const zip = await buildRawNameZip([
        { name: 'README.md', data: 'r' },
        { name, data: 'x' },
      ]);

      const result = await extractZip(root.path, zip);

      expect(await listTree(targetOf(root.path))).toEqual(['README.md']);
      expect(result).toMatchObject({ keptFiles: 1, skippedDeviceNames: 1, skippedLinks: 0 });
    },
  );

  it('RF-130 judges names below the stripped top folder, so a top folder named aux is kept', async () => {
    const zip = await buildZip([
      { name: 'aux/a.txt', data: 'a' },
      { name: 'aux/b.txt', data: 'b' },
    ]);

    const result = await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['a.txt', 'b.txt']);
    expect(result.skippedDeviceNames).toBe(0);
  });

  it('RF-130 a skipped device-named file beside a folder blocks the strip decision', async () => {
    const zip = await buildZip([
      { name: 'proj/a.cs', data: 'a' },
      { name: 'aux.c', data: 'x' },
    ]);

    await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['proj/a.cs']);
  });
});

describe('YauzlZipExtractor links, encryption and methods', () => {
  it('RF-129 skips a symbolic link entry and counts it', async () => {
    const zip = await buildZip([
      { name: 'p/README.md', data: 'r' },
      { name: 'p/link', data: '../../etc/passwd', mode: 0o120777 },
    ]);

    const result = await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['README.md']);
    expect(result).toMatchObject({ keptFiles: 1, skippedLinks: 1, skippedDeviceNames: 0 });
  });

  it('RF-129 a regular file with a read-only mode is not mistaken for a link', async () => {
    const zip = await buildZip([{ name: 'p/a.txt', data: 'a', mode: 0o100444 }]);

    const result = await extractZip(root.path, zip);

    expect(result.skippedLinks).toBe(0);
  });
});

describe('YauzlZipExtractor encrypted and unsupported entries', () => {
  it('RF-129 mode bits are read only from a Unix host, so a DOS entry is not a link', async () => {
    const zip = patchCentral(
      await buildZip([{ name: 'p/dos.txt', data: 'd', mode: 0o120777 }]),
      'p/dos.txt',
      { versionMadeBy: 0x003f },
    );

    const result = await extractZip(root.path, zip);

    expect(result).toMatchObject({ keptFiles: 1, skippedLinks: 0 });
  });

  it('RF-129 an encrypted entry stops with RST-1914 and leaves no folder', async () => {
    const zip = patchCentral(
      await buildZip([
        { name: 'p/ok.txt', data: 'ok' },
        { name: 'p/secret.txt', data: 'secret' },
      ]),
      'p/secret.txt',
      { flags: 0x0001 },
    );

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1914' });
    expect(await targetExists(root.path)).toBe(false);
  });

  it.each([
    ['bzip2', 12],
    ['LZMA', 14],
    ['shrunk', 1],
  ])(
    'RF-129 an entry compressed with %s (method %i) stops with RST-1914',
    async (_label, method) => {
      const zip = patchCentral(await buildZip([{ name: 'p/a.txt', data: 'a' }]), 'p/a.txt', {
        method,
      });

      await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1914' });
      expect(await targetExists(root.path)).toBe(false);
    },
  );
});

const LEFT_OUT: readonly (readonly [string, string])[] = [
  ['node_modules', 'node_modules/left-pad/index.js'],
  ['a nested node_modules', 'src/node_modules/x.js'],
  ['.git', '.git/config'],
  ['bin', 'bin/app.dll'],
  ['obj', 'obj/project.assets.json'],
  ['an upper-case Bin', 'src/Bin/app.dll'],
];

describe('YauzlZipExtractor folders that are left out', () => {
  it.each(LEFT_OUT)('RF-129 leaves out %s and counts the entry', async (_label, name) => {
    const zip = await buildZip([
      { name: 'README.md', data: 'r' },
      { name, data: 'x' },
    ]);

    const result = await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['README.md']);
    expect(result).toMatchObject({ keptFiles: 1, leftOutEntries: 1 });
  });

  it('RF-129 keeps a file called bin and a folder whose name only starts with bin', async () => {
    const zip = await buildZip([
      { name: 'bin', data: 'file' },
      { name: 'binary/a.txt', data: 'a' },
    ]);

    const result = await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['bin', 'binary/a.txt']);
    expect(result.leftOutEntries).toBe(0);
  });
});

describe('YauzlZipExtractor left-out folders and the top-level folder', () => {
  it('RF-129 an encrypted entry stops the upload even in a folder that is left out', async () => {
    const zip = patchCentral(
      await buildZip([
        { name: 'README.md', data: 'r' },
        { name: 'node_modules/x.js', data: 'x' },
      ]),
      'node_modules/x.js',
      { flags: 0x0001 },
    );

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1914' });
  });

  it('RF-130 left-out entries do not stop the single top-level folder from being stripped', async () => {
    const zip = await buildZip([
      { name: 'proj/a.cs', data: 'a' },
      { name: 'proj/node_modules/x.js', data: 'x' },
      { name: 'node_modules/y.js', data: 'y' },
    ]);

    const result = await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['a.cs']);
    expect(result.leftOutEntries).toBe(2);
  });

  it('RF-129 counts files left out, not the directory entries around them', async () => {
    const zip = await buildZip([
      { name: 'README.md', data: 'r' },
      { name: 'node_modules/', directory: true },
      { name: 'node_modules/a.js', data: 'a' },
    ]);

    const result = await extractZip(root.path, zip);

    expect(result.leftOutEntries).toBe(1);
  });

  it('RF-129 an unsafe name is refused even inside a folder that would be left out', async () => {
    const zip = await buildRawNameZip([
      { name: 'README.md', data: 'r' },
      { name: 'node_modules/../../x', data: 'x' },
    ]);

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1913' });
  });
});

describe('YauzlZipExtractor __MACOSX folders (RF-129, DEC-151)', () => {
  it('RF-129 a __MACOSX tree is left out and counted', async () => {
    const zip = await buildZip([
      { name: 'proj/a.txt', data: 'a' },
      { name: '__MACOSX/proj/._a.txt', data: 'x' },
      { name: '__MACOSX/._proj', data: 'y' },
    ]);

    const result = await extractZip(root.path, zip);

    expect(result.keptFiles).toBe(1);
    expect(result.leftOutEntries).toBe(2);
  });

  it('RF-129 a project folder literally named __MACOSX below the top level is left out at any depth', async () => {
    const zip = await buildZip([
      { name: 'proj/a.txt', data: 'a' },
      { name: 'proj/__MACOSX/b.txt', data: 'b' },
    ]);

    const result = await extractZip(root.path, zip);

    expect(result.keptFiles).toBe(1);
    expect(result.leftOutEntries).toBe(1);
  });
});
