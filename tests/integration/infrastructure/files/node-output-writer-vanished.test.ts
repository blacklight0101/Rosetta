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
// between the temporary write and the rename, so the rename fails with ENOENT and the write is a
// refusal (not-found). An ENOENT whose folder is still there is not that case and is rethrown.

type Mode = 'off' | 'remove-folder' | 'remove-folder-eacces' | 'enoent-only';
const vanish = vi.hoisted((): { mode: Mode; code: string } => ({ mode: 'off', code: 'EACCES' }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      const [from] = args;
      const mode = vanish.mode;
      vanish.mode = 'off';
      if (mode === 'remove-folder' || mode === 'remove-folder-eacces') {
        // The folder that holds the temporary file goes first, as a concurrent delete would do it.
        await actual.rm(dirname(String(from)), { recursive: true, force: true });
      }
      if (mode === 'remove-folder-eacces') {
        throw Object.assign(new Error(`${vanish.code}: rename refused`), { code: vanish.code });
      }
      if (mode === 'enoent-only') {
        throw Object.assign(new Error('ENOENT: rename refused'), { code: 'ENOENT' });
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

describe('NodeOutputWriter when an ENOENT comes during the write', () => {
  it('RF-005 writeText answers not-found when the folder goes before the rename', async () => {
    await mkdir(join(userFolder(), 'projects', 'run-1'), { recursive: true });
    const writer = newWriter();
    vanish.mode = 'remove-folder';

    const result = await writer.writeText(
      { userId, path: 'projects/run-1/out.json' },
      '{"ok":true}\n',
    );

    expect(vanish.mode).toBe('off');
    expect(result).toMatchObject({ ok: false, error: { reason: 'not-found' } });
    expect(await temporaryFiles(userFolder())).toEqual([]);
  });

  it('RF-005 writeText rethrows an ENOENT when the folder is still there', async () => {
    await mkdir(join(userFolder(), 'projects', 'run-2'), { recursive: true });
    const writer = newWriter();
    vanish.mode = 'enoent-only';

    await expect(
      writer.writeText({ userId, path: 'projects/run-2/out.json' }, '{}\n'),
    ).rejects.toThrow('ENOENT: rename refused');
    expect(await temporaryFiles(userFolder())).toEqual([]);
  });
});

describe('NodeOutputWriter when a permission error comes with the folder gone', () => {
  it.each(['EACCES', 'EPERM'])(
    'RF-005 writeText rethrows a %s when the folder is gone: it is not a deleted folder',
    async (code) => {
      await mkdir(join(userFolder(), 'projects', 'run-3'), { recursive: true });
      const writer = newWriter();
      vanish.mode = 'remove-folder-eacces';
      vanish.code = code;

      await expect(
        writer.writeText({ userId, path: 'projects/run-3/out.json' }, '{}\n'),
      ).rejects.toThrow(`${code}: rename refused`);
      expect(vanish.mode).toBe('off');
    },
  );
});
