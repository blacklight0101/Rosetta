import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// RNF-005: the three CI shards of the end-to-end project are fixed lists of spec files
// (tests/e2e/shards.json, read by scripts/run-e2e.mjs). A spec that is in no shard would never run in
// CI, so every spec file must be in exactly one shard.

const root = process.cwd();

async function specFiles(folder: string): Promise<string[]> {
  const entries = await readdir(join(root, folder), { recursive: true });
  return entries
    .map((entry) => entry.split('\\').join('/'))
    .filter((entry) => entry.endsWith('.spec.ts'))
    .map((entry) => `${folder}/${entry}`)
    .sort();
}

const shardMap = z.record(z.string(), z.array(z.string()));

async function shards(): Promise<Record<string, string[]>> {
  const text = await readFile(join(root, 'tests', 'e2e', 'shards.json'), 'utf8');
  return shardMap.parse(JSON.parse(text));
}

describe('End-to-end shards', () => {
  it('RNF-005 has the three shards of the CI matrix, each a list of spec files', async () => {
    const map = await shards();

    expect(Object.keys(map)).toEqual(['1', '2', '3']);
    for (const files of Object.values(map)) {
      expect(files.length).toBeGreaterThan(0);
    }
  });

  it('RNF-005 every spec file of tests/e2e is in exactly one shard, and every shard entry exists', async () => {
    const listed = Object.values(await shards()).flat();
    const onDisk = await specFiles('tests/e2e');

    expect(listed.filter((file, index) => listed.indexOf(file) !== index)).toEqual([]);
    expect([...new Set(listed)].sort()).toEqual(onDisk);
  });
});
