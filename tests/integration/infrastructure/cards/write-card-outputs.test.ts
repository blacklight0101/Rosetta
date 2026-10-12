import { describe, expect, it } from 'vitest';
import { assignCardIds } from '../../../../src/domain/cards/card-ids.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  writeCardOutputs,
  writeInvalidOutput,
} from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { cardSource, twoAreas } from '../../../support/card-fixtures.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const folder = 'projects/p1/runs/20261012-100000-understand';

describe('card writers on the real output writer', () => {
  const data = useTempRoot('rosetta-cards-');

  function writer(): NodeOutputWriter {
    return new NodeOutputWriter({ dataDir: data.path, logger: new MemoryLogger() });
  }

  it('RF-302 cards written to the run folder can be read back, and a rewrite keeps every claim', async () => {
    const cards = assignCardIds(twoAreas());
    if (!cards.ok) throw new Error('fixture');
    const outputs = writer();
    const input = { cards: cards.value, source: cardSource, masker: new SecretMasker() };

    const first = await writeCardOutputs(outputs, { userId, folder }, input);
    const second = await writeCardOutputs(outputs, { userId, folder }, input);

    expect(first.ok && second.ok).toBe(true);
    const index = await outputs.readText({ userId, path: `${folder}/cards/index.json` });
    expect(index.ok && JSON.parse(index.value).cards).toHaveLength(7);
    const card = await outputs.readText({ userId, path: `${folder}/cards/OQ/OQ-001.md` });
    expect(card.ok && card.value).toContain('Which roles may cancel a paid order?');
  });

  it('RF-005 a folder that leaves the workspace is refused and nothing is written', async () => {
    const cards = assignCardIds(twoAreas());
    if (!cards.ok) throw new Error('fixture');

    const result = await writeCardOutputs(
      writer(),
      { userId, folder: '../other' },
      { cards: cards.value, source: cardSource, masker: new SecretMasker() },
    );

    expect(result.ok).toBe(false);
  });

  it('RF-202 raw output of a task marked InvalidOutput is saved, masked, under the run folder', async () => {
    const outputs = writer();
    const leaked = `not json ${fakeOpenAiKey}`;

    const result = await writeInvalidOutput(
      outputs,
      { userId, folder },
      {
        agentTaskId: 'task-orders',
        rawOutputs: [leaked, 'second try'],
        masker: new SecretMasker(),
      },
    );

    expect(result.ok).toBe(true);
    const saved = await outputs.readText({
      userId,
      path: `${folder}/invalid-output/task-orders.txt`,
    });
    expect(saved.ok && saved.value).toContain('second try');
    expect(saved.ok && saved.value).not.toContain(fakeOpenAiKey);
    expect(saved.ok && saved.value).toContain('[MASKED:api-key]');
  });

  it('RF-202 an agent task id that is not a plain id cannot choose the file path', async () => {
    const result = await writeInvalidOutput(
      writer(),
      { userId, folder },
      { agentTaskId: '../../escape', rawOutputs: ['x'], masker: new SecretMasker() },
    );

    expect(result.ok).toBe(false);
  });
});
