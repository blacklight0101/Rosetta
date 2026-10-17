import { describe, expect, it } from 'vitest';
import type { Card } from '../../../../src/domain/cards/card.js';
import { applyMerges } from '../../../../src/domain/cards/card-merge.js';
import { ok, err, type Result } from '../../../../src/domain/errors/result.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type {
  WorkspaceFile,
  WriteRefusal,
} from '../../../../src/application/ports/output-writer.js';
import { writeCardOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { cardLogger, cardTarget, fileOf } from '../../../support/card-output-harness.js';
import { cardsAcrossAreas } from '../../../support/merge-fixtures.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-250, RF-302: when consolidation merges cards, the set is written again and the files of the
// cards that went into another card are removed, so the run folder holds each card once.

class StubbornWriter extends MemoryOutputWriter {
  override remove(file: WorkspaceFile): Promise<Result<void, WriteRefusal>> {
    const refusal = {
      code: ERROR_CODES.pathOutsideRoot,
      reason: 'outside-workspace',
      message: 'no',
    } as const;
    return Promise.resolve(file.path.endsWith('ENT-002.md') ? err(refusal) : ok(undefined));
  }
}

function merged(): { before: readonly Card[]; after: readonly Card[] } {
  const before = cardsAcrossAreas();
  const merge = { ids: ['ENT-001', 'ENT-002'], title: 'Customer', summary: 'One.' };
  return { before, after: applyMerges(before, [merge]).cards };
}

function input(cards: readonly Card[], mergedAway: readonly Card[] = []) {
  const logger = cardLogger();
  return { cards, mergedAway, source: cardSource, masker: new SecretMasker(), logger };
}

describe('writeCardOutputs for cards merged into another', () => {
  it('RF-250 the file of a card that was merged away is removed, the others stay', async () => {
    const writer = new MemoryOutputWriter();
    const { before, after } = merged();
    await writeCardOutputs(writer, cardTarget, input(before));
    const gone = before.filter((card) => card.id === 'ENT-002');

    const result = await writeCardOutputs(writer, cardTarget, input(after, gone));

    expect(result.ok).toBe(true);
    expect(fileOf(writer, 'cards/ENT/ENT-002.md')).toBe('');
    expect(fileOf(writer, 'cards/ENT/ENT-001.md')).toContain('mergedFrom');
    expect(fileOf(writer, 'cards/BR/BR-001.md')).not.toBe('');
    expect(fileOf(writer, 'cards/index.json')).not.toContain('ENT-002');
  });

  it('RF-250 a file that cannot be removed is a refusal, not a silent duplicate', async () => {
    const writer = new StubbornWriter();
    const { before, after } = merged();
    await writeCardOutputs(writer, cardTarget, input(before));
    const gone = before.filter((card) => card.id === 'ENT-002');

    const result = await writeCardOutputs(writer, cardTarget, input(after, gone));

    expect(result.ok).toBe(false);
  });
});
