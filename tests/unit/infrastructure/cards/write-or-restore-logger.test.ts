import { describe, expect, it } from 'vitest';
import type { Logger } from '../../../../src/application/ports/logger.js';
import { writeOrRestore } from '../../../../src/infrastructure/cards/write-or-restore.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { RefusingWriter, type AfterRefusal } from '../../../support/refusing-writer.js';

/** A logger whose every call fails, as a log file that cannot be written would. */
const throwingLogger: Logger = {
  log: () => Promise.reject(new Error('log file gone')),
  securityEvent: () => Promise.reject(new Error('log file gone')),
};

/** A logger whose `log` throws before it returns a promise, as a non-async implementation would. */
const syncThrowingLogger: Logger = {
  log: () => {
    throw new Error('log file gone');
  },
  securityEvent: () => Promise.reject(new Error('log file gone')),
};

function plannedWrites() {
  return ['a.md', 'b.md', 'c.md'].map((name) => ({
    file: { userId: 'u1', path: `projects/p/runs/r/cards/${name}` },
    text: `new ${name}`,
  }));
}

describe('writeOrRestore when the logger throws while reporting a failed restore', () => {
  it.each<AfterRefusal>(['refuses-restores', 'throws-on-restore'])(
    'RNF-002 a restore that %s with a throwing logger still returns the original refusal',
    async (after) => {
      const writer = new RefusingWriter(new MemoryOutputWriter(), 3, after);

      await expect(writeOrRestore(writer, throwingLogger, plannedWrites())).resolves.toMatchObject({
        ok: false,
        error: { message: 'no' },
      });
    },
  );

  it.each<AfterRefusal>(['refuses-restores', 'throws-on-restore'])(
    'RNF-002 a restore that %s with a logger that throws synchronously still returns the refusal',
    async (after) => {
      const writer = new RefusingWriter(new MemoryOutputWriter(), 3, after);

      await expect(
        writeOrRestore(writer, syncThrowingLogger, plannedWrites()),
      ).resolves.toMatchObject({ ok: false, error: { message: 'no' } });
    },
  );

  it('RNF-002 a write that throws, then a failed restore and a throwing logger, rethrows the write error', async () => {
    const writer = new RefusingWriter(new MemoryOutputWriter(), 3, 'refuses-restores', true);

    await expect(writeOrRestore(writer, throwingLogger, plannedWrites())).rejects.toThrow(
      'disk full',
    );
  });
});
