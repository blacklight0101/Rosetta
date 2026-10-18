import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runBackup } from '../../../scripts/backup/backup-run.js';

let root = '';
let dataDir = '';
let backupDir = '';
let lines: string[] = [];

const log = (line: string): void => {
  lines.push(line);
};
const dumper = (text: string) => async (destination: string) => {
  await writeFile(destination, text);
};
const at = (stamp: string): Date => new Date(`${stamp}T03:00:00Z`);
const listing = async (): Promise<string[]> => (await readdir(backupDir)).sort();

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rst-backup-'));
  dataDir = join(root, 'data');
  backupDir = join(root, 'backups');
  lines = [];
  await mkdir(join(dataDir, 'users', 'u1'), { recursive: true });
  await writeFile(join(dataDir, 'users', 'u1', 'run.json'), '{"ok":true}');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('runBackup', () => {
  it('RF-1306 writes the daily dump and a first data copy', async () => {
    const result = await runBackup({
      now: at('2026-10-18'),
      backupDir,
      dataDir,
      dumpDatabase: dumper('DUMP-1'),
      log,
    });
    expect(result.dump).toBe('rosetta-db-2026-10-18.dump');
    expect(result.dataCopy).toBe('rosetta-data-2026-10-18');
    expect(await listing()).toEqual(['rosetta-data-2026-10-18', 'rosetta-db-2026-10-18.dump']);
    expect(await readFile(join(backupDir, result.dump), 'utf8')).toBe('DUMP-1');
    const copied = join(backupDir, 'rosetta-data-2026-10-18', 'users', 'u1', 'run.json');
    expect(await readFile(copied, 'utf8')).toBe('{"ok":true}');
  });

  it('RF-1306 copies the data folder once a week, not every day', async () => {
    const run = (stamp: string) =>
      runBackup({ now: at(stamp), backupDir, dataDir, dumpDatabase: dumper(stamp), log });
    await run('2026-10-11');
    const next = await run('2026-10-12');
    expect(next.dataCopy).toBeNull();
    const week = await run('2026-10-18');
    expect(week.dataCopy).toBe('rosetta-data-2026-10-18');
    expect((await listing()).filter((name) => name.startsWith('rosetta-data-'))).toEqual([
      'rosetta-data-2026-10-11',
      'rosetta-data-2026-10-18',
    ]);
  });
});

describe('runBackup pruning', () => {
  it('RF-1306 prunes dumps older than 7 days and leaves other files alone', async () => {
    await mkdir(backupDir, { recursive: true });
    await writeFile(join(backupDir, 'rosetta-db-2026-10-01.dump'), 'old');
    await writeFile(join(backupDir, 'rosetta-db-2026-10-12.dump'), 'recent');
    await writeFile(join(backupDir, 'keep-me.txt'), 'mine');
    const result = await runBackup({
      now: at('2026-10-18'),
      backupDir,
      dataDir,
      dumpDatabase: dumper('new'),
      log,
    });
    expect(result.pruned).toEqual(['rosetta-db-2026-10-01.dump']);
    expect(await listing()).toEqual([
      'keep-me.txt',
      'rosetta-data-2026-10-18',
      'rosetta-db-2026-10-12.dump',
      'rosetta-db-2026-10-18.dump',
    ]);
  });

  it('RF-1306 prunes nothing and leaves no partial file when the dump fails', async () => {
    await mkdir(backupDir, { recursive: true });
    await writeFile(join(backupDir, 'rosetta-db-2026-10-01.dump'), 'old');
    const failing = async (destination: string): Promise<void> => {
      await writeFile(destination, 'half');
      throw new Error('pg_dump exit code 1');
    };
    await expect(
      runBackup({ now: at('2026-10-18'), backupDir, dataDir, dumpDatabase: failing, log }),
    ).rejects.toThrow('pg_dump exit code 1');
    expect(await listing()).toEqual(['rosetta-db-2026-10-01.dump']);
  });
});

describe('runBackup safety', () => {
  it('RF-1306 refuses a backup folder inside the data folder, and the reverse', async () => {
    for (const [data, backups] of [
      [dataDir, join(dataDir, 'backups')],
      [join(root, 'backups', 'data'), backupDir],
    ] as const) {
      await expect(
        runBackup({
          now: at('2026-10-18'),
          backupDir: backups,
          dataDir: data,
          dumpDatabase: dumper('x'),
          log,
        }),
      ).rejects.toThrow(/inside/u);
    }
  });

  it('RF-1306 logs file names and sizes only, with no secret', async () => {
    const secret = ['sentinel', 'value', String(0x5eed0123)].join('-');
    process.env['PGPASSWORD'] = secret;
    try {
      await runBackup({
        now: at('2026-10-18'),
        backupDir,
        dataDir,
        dumpDatabase: dumper('DUMP'),
        log,
      });
    } finally {
      delete process.env['PGPASSWORD'];
    }
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).toContain('rosetta-db-2026-10-18.dump');
    expect(lines.join('\n')).not.toContain(secret);
    expect(lines.join('\n')).not.toContain(root);
  });
});
