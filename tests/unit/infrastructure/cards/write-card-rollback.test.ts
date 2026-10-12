import { describe, expect, it } from 'vitest';
import type {
  WorkspaceFile,
  WriteRefusal,
} from '../../../../src/application/ports/output-writer.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { err, type Result } from '../../../../src/domain/errors/result.js';
import {
  writeCardOutputs,
  writeInvalidOutput,
} from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { cardsOf, cardTarget } from '../../../support/card-output-harness.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

/** Refuses the n-th write (1-based) as the workspace guard would. */
class RefusingWriter extends MemoryOutputWriter {
  private count = 0;

  private readonly refuseAt: number;

  constructor(refuseAt: number) {
    super();
    this.refuseAt = refuseAt;
  }

  override writeText(file: WorkspaceFile, content: string): Promise<Result<void, WriteRefusal>> {
    this.count += 1;
    if (this.count !== this.refuseAt) return super.writeText(file, content);
    const refusal: WriteRefusal = {
      code: ERROR_CODES.pathOutsideRoot,
      reason: 'outside-workspace',
      message: 'no',
    };
    return Promise.resolve(err(refusal));
  }
}

describe('writeCardOutputs when the writer refuses part-way', () => {
  it.each([1, 4, 9])(
    'RF-005 a refusal of write %i removes the files this call wrote',
    async (n) => {
      const writer = new RefusingWriter(n);

      const result = await writeCardOutputs(writer, cardTarget, {
        cards: cardsOf(),
        source: cardSource,
        masker: new SecretMasker(),
      });

      expect(result.ok).toBe(false);
      expect([...writer.files.keys()]).toEqual([]);
    },
  );

  it('RF-005 the refusal is the one returned, not a cleanup result', async () => {
    const result = await writeCardOutputs(new RefusingWriter(3), cardTarget, {
      cards: cardsOf(),
      source: cardSource,
      masker: new SecretMasker(),
    });

    expect(!result.ok && result.error.reason).toBe('outside-workspace');
  });
});

describe('writeInvalidOutput task ids', () => {
  it.each([
    'a:b',
    'a b',
    'a\nb',
    'a/b',
    'a\\b',
    '.hidden',
    'trailing.',
    '',
    'x'.repeat(101),
    'CON',
    'con',
    'NUL',
    'aux',
    'PRN',
    'COM1',
    'lpt9',
    'CON.txt',
  ])('RF-202 the task id %j cannot name the file', async (agentTaskId) => {
    const writer = new MemoryOutputWriter();

    const result = await writeInvalidOutput(writer, cardTarget, {
      agentTaskId,
      rawOutputs: ['x'],
      masker: new SecretMasker(),
    });

    expect(result.ok).toBe(false);
    expect(writer.writes).toEqual([]);
  });

  it.each(['task-orders', 'T1', 'a.b_c-d', 'COM10', 'console'])(
    'RF-202 the plain task id %s is accepted',
    async (agentTaskId) => {
      const writer = new MemoryOutputWriter();

      const result = await writeInvalidOutput(writer, cardTarget, {
        agentTaskId,
        rawOutputs: ['x'],
        masker: new SecretMasker(),
      });

      expect(result.ok).toBe(true);
    },
  );
});
