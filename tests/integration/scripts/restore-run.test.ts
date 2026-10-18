import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RestoreRefused, runRestore } from '../../../scripts/backup/restore-run.js';

let root = '';
let dump = '';
let source = '';
let target = '';
let restored: { file: string; replace: boolean }[] = [];

const restoreDatabase = (file: string, replace: boolean): Promise<void> => {
  restored.push({ file, replace });
  return Promise.resolve();
};
const log = (): void => undefined;
const tables = (count: number) => () => Promise.resolve(count);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rst-restore-'));
  dump = join(root, 'rosetta-db-2026-10-18.dump');
  source = join(root, 'rosetta-data-2026-10-18');
  target = join(root, 'target');
  restored = [];
  await writeFile(dump, 'DUMP');
  await mkdir(join(source, 'users'), { recursive: true });
  await writeFile(join(source, 'users', 'a.txt'), 'A');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('runRestore', () => {
  it('RF-1306 restores the dump into an empty database and the data folder into an empty target', async () => {
    const result = await runRestore({
      dumpFile: dump,
      dataSource: source,
      dataTarget: target,
      force: false,
      countTables: tables(0),
      restoreDatabase,
      log,
    });
    expect(result).toEqual({ databaseRestored: true, dataRestored: true });
    expect(restored).toEqual([{ file: dump, replace: false }]);
    expect(await readFile(join(target, 'users', 'a.txt'), 'utf8')).toBe('A');
  });

  it('RF-1306 refuses to restore over a database that has tables unless forced', async () => {
    await expect(
      runRestore({
        dumpFile: dump,
        dataSource: source,
        dataTarget: target,
        force: false,
        countTables: tables(12),
        restoreDatabase,
        log,
      }),
    ).rejects.toBeInstanceOf(RestoreRefused);
    expect(restored).toEqual([]);
    await expect(readFile(join(target, 'users', 'a.txt'), 'utf8')).rejects.toThrow();
  });

  it('RF-1306 replaces the database content when forced', async () => {
    const result = await runRestore({
      dumpFile: dump,
      force: true,
      countTables: tables(12),
      restoreDatabase,
      log,
    });
    expect(result).toEqual({ databaseRestored: true, dataRestored: false });
    expect(restored).toEqual([{ file: dump, replace: true }]);
  });
});

describe('runRestore data folder', () => {
  it('RF-1306 refuses a non-empty data target before changing the database', async () => {
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'existing.txt'), 'E');
    await expect(
      runRestore({
        dumpFile: dump,
        dataSource: source,
        dataTarget: target,
        force: false,
        countTables: tables(0),
        restoreDatabase,
        log,
      }),
    ).rejects.toThrow(/not empty/u);
    expect(restored).toEqual([]);
    expect(await readFile(join(target, 'existing.txt'), 'utf8')).toBe('E');
  });

  it('RF-1306 stops when the dump file is missing', async () => {
    await expect(
      runRestore({
        dumpFile: join(root, 'missing.dump'),
        force: false,
        countTables: tables(0),
        restoreDatabase,
        log,
      }),
    ).rejects.toThrow(/dump/u);
    expect(restored).toEqual([]);
  });
});
