import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chooseBackups, parseFlags } from '../../../scripts/backup/cli.js';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rst-choice-'));
  for (const name of ['rosetta-db-2026-10-16.dump', 'rosetta-db-2026-10-18.dump', 'other.txt']) {
    await writeFile(join(dir, name), 'x');
  }
  await mkdir(join(dir, 'rosetta-data-2026-10-11'));
  await mkdir(join(dir, 'rosetta-data-2026-10-04'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('restore backup selection', () => {
  it('RF-1306 picks the newest dump, and a data copy only with a data target', async () => {
    const dumpOnly = await chooseBackups(dir, parseFlags([]));
    expect(dumpOnly).toEqual({ dumpFile: join(dir, 'rosetta-db-2026-10-18.dump') });
    const both = await chooseBackups(dir, parseFlags(['--data-target', 'out']));
    expect(both.dataSource).toBe(join(dir, 'rosetta-data-2026-10-11'));
  });

  it('RF-1306 honours a named dump and a named data copy', async () => {
    const flags = parseFlags([
      '--dump',
      'rosetta-db-2026-10-16.dump',
      '--data-copy',
      'rosetta-data-2026-10-04',
      '--data-target',
      'out',
    ]);
    expect(await chooseBackups(dir, flags)).toEqual({
      dumpFile: join(dir, 'rosetta-db-2026-10-16.dump'),
      dataSource: join(dir, 'rosetta-data-2026-10-04'),
    });
  });

  it('RF-1306 stops when there is no dump or no data copy to use', async () => {
    await rm(join(dir, 'rosetta-data-2026-10-11'), { recursive: true });
    await rm(join(dir, 'rosetta-data-2026-10-04'), { recursive: true });
    await expect(chooseBackups(dir, parseFlags(['--data-target', 'out']))).rejects.toThrow(
      /data folder copy/u,
    );
    await rm(join(dir, 'rosetta-db-2026-10-16.dump'));
    await rm(join(dir, 'rosetta-db-2026-10-18.dump'));
    await expect(chooseBackups(dir, parseFlags([]))).rejects.toThrow(/No database dump/u);
  });
});
