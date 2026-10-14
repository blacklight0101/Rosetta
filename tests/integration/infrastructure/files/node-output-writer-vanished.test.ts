import { mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type * as FsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-005, P1-155: a run or a project deleted while its file is being written removes the folder
// between the temporary write and the rename. The rename then fails with ENOENT; that is a
// refusal of the write, not a server fault, and the temporary file is not left behind.

const vanish = vi.hoisted(() => ({ armed: false }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (vanish.armed) {
        vanish.armed = false;
        // The folder that holds the temporary file goes first, as a concurrent delete would do it.
        const [from] = args;
        await actual.rm(dirname(String(from)), { recursive: true, force: true });
      }
      return actual.rename(...args);
    },
  };
});

const temp = useTempRoot('rosetta-writer-vanished-');
const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';

function userFolder(): string {
  return join(temp.path, 'data', 'users', userId);
}

function newWriter(): NodeOutputWriter {
  const logger = new MemoryLogger(new FixedClock('2026-10-14T09:00:00.000Z'), new SecretMasker());
  return new NodeOutputWriter({ dataDir: join(temp.path, 'data'), logger });
}

async function temporaryFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true }).catch(() => []);
  return entries.filter((entry) => entry.endsWith('.tmp'));
}

describe('NodeOutputWriter when the folder is deleted during the write', () => {
  it('RF-005 writeText answers not-found when the folder goes before the rename', async () => {
    await mkdir(join(userFolder(), 'projects', 'run-1'), { recursive: true });
    const writer = newWriter();
    vanish.armed = true;

    const result = await writer.writeText(
      { userId, path: 'projects/run-1/out.json' },
      '{"ok":true}\n',
    );

    expect(vanish.armed).toBe(false);
    expect(result).toMatchObject({ ok: false, error: { reason: 'not-found' } });
    expect(await temporaryFiles(userFolder())).toEqual([]);
  });
});
