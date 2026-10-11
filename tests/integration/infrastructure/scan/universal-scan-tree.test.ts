import { link, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyFixture, scanTree } from '../../../support/scan-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { writeTree } from '../../../support/snapshot-fixture.js';

const temp = useTempRoot('rosetta-scan-');

describe('universal scan of a tree with ignorable content', () => {
  it('RF-100 leaves out version control, build output, dependencies, packages and binary files', async () => {
    await copyFixture('php-shop', temp.path);
    await writeTree(temp.path, {
      '.git/HEAD': 'ref: refs/heads/main\n',
      'bin/Debug/App.txt': 'built\n',
      'src/obj/cache.txt': 'cache\n',
      'node_modules/dep/index.js': 'module.exports = 1;\n',
      'packages/lib/readme.txt': 'package\n',
    });
    await writeFile(join(temp.path, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]));
    await writeFile(join(temp.path, 'tool.dll'), Buffer.from([0x4d, 0x5a, 0, 0]));
    const { scan } = await scanTree(temp.path);

    expect(scan.files.map((file) => file.path)).toEqual([
      'composer.json',
      'config.ini',
      'index.php',
      'sql/create.sql',
      'src/OrderController.php',
      'src/helpers.php',
    ]);
  });

  it('RF-100 a binary file with an unfamiliar extension is listed as skipped: binary, with no counts', async () => {
    await writeFile(join(temp.path, 'blob.dat'), Buffer.from([1, 2, 0, 3, 4]));
    const { scan } = await scanTree(temp.path);

    const { sha256, ...facts } = scan.files[0] ?? { path: 'missing' };

    expect(scan.files).toHaveLength(1);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(facts).toEqual({
      path: 'blob.dat',
      language: 'unknown',
      lines: 0,
      estimatedTokens: 0,
      artefactKinds: [],
      skipped: 'binary',
    });
  });
});

describe('universal scan of a tree with ignorable content (part 2)', () => {
  it('RF-100 a file over the limit is listed as skipped: too large and is never read', async () => {
    await copyFixture('php-shop', temp.path);
    await writeFile(join(temp.path, 'export.csv'), Buffer.alloc(3_000_000, 97));
    const { scan } = await scanTree(temp.path, { maxFileBytes: 100 });

    expect(scan.files.find((file) => file.path === 'export.csv')).toEqual({
      path: 'export.csv',
      language: 'unknown',
      lines: 0,
      estimatedTokens: 0,
      artefactKinds: [],
      skipped: 'too-large',
    });
    expect(scan.files.find((file) => file.path === 'src/OrderController.php')?.skipped).toBe(
      'too-large',
    );
    expect(scan.files.find((file) => file.path === 'composer.json')?.skipped).toBeUndefined();
    expect(scan.sqlStatements.filter((s) => s.path === 'src/OrderController.php')).toEqual([]);
  });

  it('RF-100 a file of exactly the limit is read', async () => {
    await writeTree(temp.path, { 'a.txt': '12345' });
    const { scan } = await scanTree(temp.path, { maxFileBytes: 5 });

    expect(scan.files[0]).toMatchObject({ path: 'a.txt', lines: 1, estimatedTokens: 2 });
    expect(scan.files[0]?.skipped).toBeUndefined();
  });

  it('RF-124 default ignores apply below the subpath only', async () => {
    await writeTree(temp.path, {
      'packages/app/src/a.cs': 'class A {}\n',
      'packages/app/node_modules/x.js': 'x\n',
      'packages/other/b.cs': 'class B {}\n',
    });
    const { scan } = await scanTree(temp.path, { subpath: 'packages/app' });

    expect(scan.files.map((file) => file.path)).toEqual(['packages/app/src/a.cs']);
  });
});

describe('universal scan of a tree with ignorable content (part 3)', () => {
  it('RF-101 the language comes from the content when the extension says nothing', async () => {
    await writeTree(temp.path, { 'bin2/run': '#!/usr/bin/env python3\nprint(1)\n' });
    const { scan } = await scanTree(temp.path);

    expect(scan.files[0]).toMatchObject({ path: 'bin2/run', language: 'python', lines: 2 });
  });

  it('RF-100 reports links and invalid names the reader skipped', async () => {
    const foldedName = 'src/．．';
    await writeTree(temp.path, { [foldedName]: 'x\n', 'src/a.ts': 'y\n' });
    const { scan } = await scanTree(temp.path);

    expect(scan.files.map((file) => file.path)).toEqual(['src/a.ts']);
    expect(scan.skippedPaths).toEqual({ links: [], invalidNames: [foldedName] });
  });

  it('RF-100 a file the reader lists but refuses to read is reported, not fatal', async () => {
    await writeTree(temp.path, { 'a/one.txt': 'one\n', 'a/two.txt': 'two\n' });
    await mkdir(join(temp.path, 'b'), { recursive: true });
    await link(join(temp.path, 'a', 'two.txt'), join(temp.path, 'b', 'hard.txt'));
    const { scan } = await scanTree(temp.path);

    expect(scan.files.map((file) => file.path)).toEqual(['a/one.txt']);
    expect(scan.unreadable).toEqual(['a/two.txt', 'b/hard.txt']);
  });
});
