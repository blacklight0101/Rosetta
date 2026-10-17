import { describe, expect, it } from 'vitest';
import type { Card } from '../../../../src/domain/cards/card.js';
import { writeCardOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource, draftOf } from '../../../support/card-fixtures.js';
import { cardLogger, cardsOf, cardTarget } from '../../../support/card-output-harness.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-262, RF-302: data-model.md exists only while the run holds an ENT card. A re-run into a
// folder that already has the file but no longer has an entity removes it, so the folder never
// shows a data model of cards that are gone.

const modelPath = `${cardTarget.folder}/data-model.md`;

function write(writer: MemoryOutputWriter, cards: readonly Card[]) {
  return writeCardOutputs(writer, cardTarget, {
    cards,
    source: cardSource,
    masker: new SecretMasker(),
    logger: cardLogger(),
  });
}

const withEntity = cardsOf([
  { agentTaskId: 't', area: 'a', drafts: [draftOf(), draftOf({ type: 'ENT', title: 'Order' })] },
]);
const withoutEntity = cardsOf([{ agentTaskId: 't', area: 'a', drafts: [draftOf()] }]);

describe('data-model.md on a re-run', () => {
  it('RF-262 is removed when the cards now hold no ENT card', async () => {
    const writer = new MemoryOutputWriter();
    expect((await write(writer, withEntity)).ok).toBe(true);
    expect(writer.files.has(modelPath)).toBe(true);

    const second = await write(writer, withoutEntity);

    expect(second.ok).toBe(true);
    expect(writer.files.has(modelPath)).toBe(false);
    expect(writer.files.has(`${cardTarget.folder}/spec.md`)).toBe(true);
  });

  it('RF-262 is kept and rewritten while an ENT card remains', async () => {
    const writer = new MemoryOutputWriter();
    await write(writer, withEntity);

    await write(writer, withEntity);

    expect(writer.files.get(modelPath)).toContain('### ENT-001 Order');
  });

  it('RF-262 a first run without an ENT card writes no data-model.md and removes nothing else', async () => {
    const writer = new MemoryOutputWriter();
    writer.files.set(`${cardTarget.folder}/notes.md`, 'keep');

    await write(writer, withoutEntity);

    expect(writer.files.has(modelPath)).toBe(false);
    expect(writer.files.get(`${cardTarget.folder}/notes.md`)).toBe('keep');
  });
});
