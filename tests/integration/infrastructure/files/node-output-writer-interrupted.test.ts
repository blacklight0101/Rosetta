import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type * as FsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-504, RNF-002: a text file is replaced whole or not at all. The disk write is made to fail
// after half of the text has reached the file it was given (a full disk, a killed process); the
// file that was there before must still hold its old text, and no half-written file may stay.

/** While armed, the next `writeFile` puts half of its text on disk and then fails. */
const armed = vi.hoisted(() => ({ on: false }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      const [path, data] = args;
      if (!armed.on || typeof data !== 'string') return actual.writeFile(...args);
      armed.on = false;
      await actual.writeFile(path, data.slice(0, Math.floor(data.length / 2)));
      throw new Error('the disk is full');
    },
  };
});

const temp = useTempRoot('rosetta-writer-interrupted-');
const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const folder = (): string => join(temp.path, 'data', 'users', userId, 'projects', 'p');

function newWriter(): NodeOutputWriter {
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());
  return new NodeOutputWriter({ dataDir: join(temp.path, 'data'), logger });
}

describe('NodeOutputWriter when a write is interrupted', () => {
  it('RF-504 keeps the old text of the file and leaves no temporary file when the write fails half way', async () => {
    const writer = newWriter();
    const file = { userId, path: 'projects/p/report.md' };
    await writer.writeText(file, 'old report, whole\n');

    armed.on = true;
    const failure = await writer
      .writeText(file, 'new report, which is longer than the old one\n')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(await readFile(join(folder(), 'report.md'), 'utf8')).toBe('old report, whole\n');
    expect(await readdir(folder())).toEqual(['report.md']);
  });

  it('RF-504 leaves no file at all when a first write fails half way', async () => {
    const writer = newWriter();

    armed.on = true;
    await writer
      .writeText({ userId, path: 'projects/p/report.md' }, 'a report that never completes\n')
      .catch((error: unknown) => error);

    expect(await readdir(folder())).toEqual([]);
  });
});
