import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runBackup } from '../../../scripts/backup/backup-run.js';

let root = '';
let dataDir = '';
let dumped = 0;

const attempt = (backupDir: string, data = dataDir) =>
  runBackup({
    now: new Date('2026-10-18T03:00:00Z'),
    backupDir,
    dataDir: data,
    dumpDatabase: async (destination) => {
      dumped += 1;
      await writeFile(destination, 'x');
    },
    log: () => undefined,
  });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rst-overlap-'));
  dataDir = join(root, 'data');
  dumped = 0;
  await mkdir(join(dataDir, 'users'), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('backup folder and data folder overlap', () => {
  it('RF-1306 refuses the same folder for both, before any dump is written', async () => {
    await expect(attempt(dataDir)).rejects.toThrow(/inside/u);
    expect(dumped).toBe(0);
    expect(await readdir(dataDir)).toEqual(['users']);
  });

  it('RF-1306 refuses a backup folder inside the data folder even when its name starts with two dots', async () => {
    await expect(attempt(join(dataDir, '..bk'))).rejects.toThrow(/inside/u);
    expect(dumped).toBe(0);
  });

  it('RF-1306 accepts a sibling folder whose name starts with the data folder name', async () => {
    await attempt(join(root, 'data-backups'));
    expect(dumped).toBe(1);
  });

  it('RF-1306 refuses a backup folder that reaches the data folder through a link', async () => {
    const link = join(root, 'link');
    await symlink(dataDir, link, 'junction');
    await expect(attempt(join(link, 'backups'))).rejects.toThrow(/inside/u);
    await expect(attempt(link)).rejects.toThrow(/inside/u);
    expect(dumped).toBe(0);
  });
});
