import { appendFile, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readUpTo } from '../../../../src/infrastructure/files/bounded-read.js';

// RF-144, RNF-004, ADR-006, P1-119: a file that grows between the size check and the read is
// still held to the cap; the read never returns the new, larger size.

let folder = '';
let path = '';

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'rst-bounded-read-'));
  path = join(folder, 'grows.txt');
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('bounded read', () => {
  it('RF-144 a file that grew after the size check is refused, not read at its new size', async () => {
    await writeFile(path, 'a'.repeat(100));
    const { size } = await stat(path);
    await appendFile(path, 'b'.repeat(900));

    expect(await readUpTo(path, size, 100)).toBeUndefined();
  });

  it('RF-144 a file that grew past the limit is never returned whole', async () => {
    await writeFile(path, 'a'.repeat(10));
    await appendFile(path, 'b'.repeat(5000));

    expect(await readUpTo(path, 10, 20)).toBeUndefined();
  });

  it('RF-144 a file that did not change is read in full, up to the limit', async () => {
    await writeFile(path, 'a'.repeat(100));

    const bytes = await readUpTo(path, 100, 100);

    expect(bytes?.length).toBe(100);
  });
});
