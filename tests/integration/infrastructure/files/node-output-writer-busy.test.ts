import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type * as FsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-003, RNF-002, P3-59: Windows refuses to replace a file that another handle has open (the page
// reading a run's manifest while the run writes it): `rename` fails with EPERM, EBUSY or EACCES for
// a few milliseconds. A text file is replaced all the same, and a failure that does not go away, or
// is of another kind, still surfaces with the old text in place.

/** The next `rename` calls fail with `code` while `failures` is above zero. */
const busy = vi.hoisted(() => ({ failures: 0, code: 'EPERM', calls: 0 }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      busy.calls += 1;
      if (busy.failures <= 0) return actual.rename(...args);
      busy.failures -= 1;
      throw Object.assign(new Error(`${busy.code}: the file is in use`), { code: busy.code });
    },
  };
});

const temp = useTempRoot('rosetta-writer-busy-');
const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const file = { userId, path: 'projects/p/manifest.json' };
const folder = (): string => join(temp.path, 'data', 'users', userId, 'projects', 'p');

function newWriter(): NodeOutputWriter {
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());
  return new NodeOutputWriter({ dataDir: join(temp.path, 'data'), logger });
}

async function writeOldThenFailRename(failures: number, code: string): Promise<NodeOutputWriter> {
  const writer = newWriter();
  busy.failures = 0;
  await writer.writeText(file, 'old\n');
  busy.failures = failures;
  busy.code = code;
  busy.calls = 0;
  return writer;
}

describe('NodeOutputWriter when the file to replace is in use', () => {
  it.each(['EPERM', 'EBUSY', 'EACCES'])(
    'RNF-002 replaces the file once %s goes away',
    async (code) => {
      const writer = await writeOldThenFailRename(3, code);

      const written = await writer.writeText(file, 'new\n');

      expect(written.ok).toBe(true);
      expect(busy.calls).toBe(4);
      expect(await readFile(join(folder(), 'manifest.json'), 'utf8')).toBe('new\n');
      expect(await readdir(folder())).toEqual(['manifest.json']);
    },
  );

  it('RNF-002 gives up after a bounded number of tries, keeps the old text and leaves no temporary file', async () => {
    const writer = await writeOldThenFailRename(1000, 'EPERM');

    const failure = await writer.writeText(file, 'new\n').catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'EPERM' });
    expect(busy.calls).toBeLessThanOrEqual(20);
    expect(await readFile(join(folder(), 'manifest.json'), 'utf8')).toBe('old\n');
    expect(await readdir(folder())).toEqual(['manifest.json']);
  });

  it('RNF-002 does not try again after a failure of another kind', async () => {
    const writer = await writeOldThenFailRename(1000, 'EXDEV');

    const failure = await writer.writeText(file, 'new\n').catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'EXDEV' });
    expect(busy.calls).toBe(1);
    expect(await readdir(folder())).toEqual(['manifest.json']);
  });
});
