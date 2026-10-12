import { describe, expect, it } from 'vitest';
import {
  writeCardOutputs,
  writeInvalidOutput,
} from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import {
  cardLogger,
  cardsOf,
  cardTarget,
  smallRun,
  withRejectedFirstClaim,
} from '../../../support/card-output-harness.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { RefusingWriter, type AfterRefusal } from '../../../support/refusing-writer.js';

function inputOf(cards = cardsOf(), logger = cardLogger()) {
  return { cards, source: cardSource, masker: new SecretMasker(), logger };
}

/** A memory writer that already holds the four files of `smallRun()`. */
async function writtenRun(): Promise<MemoryOutputWriter> {
  const memory = new MemoryOutputWriter();
  const first = await writeCardOutputs(memory, cardTarget, inputOf(smallRun()));
  if (!first.ok) throw new Error('fixture');
  return memory;
}

describe('writeCardOutputs when the writer refuses part-way', () => {
  it.each([1, 4, 9])(
    'RF-005 a refusal of write %i removes the files this call wrote',
    async (n) => {
      const memory = new MemoryOutputWriter();

      const result = await writeCardOutputs(new RefusingWriter(memory, n), cardTarget, inputOf());

      expect(result.ok).toBe(false);
      expect([...memory.files.keys()]).toEqual([]);
    },
  );

  it('RF-005 the refusal is the one returned, not a cleanup result', async () => {
    const writer = new RefusingWriter(new MemoryOutputWriter(), 3);

    const result = await writeCardOutputs(writer, cardTarget, inputOf());

    expect(!result.ok && result.error.reason).toBe('outside-workspace');
  });
});

describe('writeCardOutputs when a rewrite is refused part-way', () => {
  it.each([1, 2, 3, 4])(
    'RF-302 a rewrite refused at write %i leaves every earlier file exactly as it was',
    async (n) => {
      const memory = await writtenRun();
      const before = new Map(memory.files);

      const result = await writeCardOutputs(
        new RefusingWriter(memory, n),
        cardTarget,
        inputOf(withRejectedFirstClaim(smallRun())),
      );

      expect(result.ok).toBe(false);
      expect(memory.files).toEqual(before);
    },
  );

  it('RNF-002 a rewrite that adds a card and is refused at the end removes only the new file', async () => {
    const memory = await writtenRun();
    const before = new Map(memory.files);

    const result = await writeCardOutputs(
      new RefusingWriter(memory, 5),
      cardTarget,
      inputOf(smallRun(true)),
    );

    expect(result.ok).toBe(false);
    expect(memory.files).toEqual(before);
  });
});

describe('writeCardOutputs when restoring fails too', () => {
  it.each<AfterRefusal>(['refuses-restores', 'throws-on-restore'])(
    'RNF-002 a restore that %s is logged and the original refusal is returned',
    async (after) => {
      const memory = await writtenRun();
      const logger = cardLogger();

      const result = await writeCardOutputs(
        new RefusingWriter(memory, 3, after),
        cardTarget,
        inputOf(smallRun(), logger),
      );

      expect(!result.ok && result.error.message).toBe('no');
      const logged = logger.text();
      expect(logged).toContain('"level":"error"');
      expect(logged).toContain(`${cardTarget.folder}/cards/FEAT/FEAT-001.md`);
      expect(logged).toContain(`${cardTarget.folder}/cards/OQ/OQ-001.md`);
    },
  );

  it('RNF-002 a write that throws restores the earlier files and the error is rethrown', async () => {
    const memory = await writtenRun();
    const before = new Map(memory.files);
    const writer = new RefusingWriter(memory, 2, 'restores', true);

    await expect(
      writeCardOutputs(writer, cardTarget, inputOf(withRejectedFirstClaim(smallRun()))),
    ).rejects.toThrow('disk full');
    expect(memory.files).toEqual(before);
  });
});

describe('writeInvalidOutput task ids', () => {
  it.each([
    'a:b',
    'a b',
    'a\nb',
    'a/b',
    'a\b',
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
      logger: cardLogger(),
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
        logger: cardLogger(),
      });

      expect(result.ok).toBe(true);
    },
  );
});
