import { describe, expect, it } from 'vitest';
import { FilePriorCards } from '../../../../src/infrastructure/cards/prior-cards.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { cardsOf, cardTarget, writeCards } from '../../../support/card-output-harness.js';
import { flowDraft, screenDraft } from '../../../support/flow-screen-fixtures.js';

// RF-241 reads the earlier cards of a run from their files; FLOW and SCRN files are cards too.

const runKey = '20261012-100000-understand';

describe('the earlier FLOW and SCRN cards of a run', () => {
  it('RF-241 are read back from the files the writer made', async () => {
    const { writer } = await writeCards(
      cardsOf([{ agentTaskId: 't', area: 'orders', drafts: [flowDraft(), screenDraft()] }]),
    );

    const project = {
      userId: '00000000-0000-4000-9000-0000000000a1',
      projectId: '00000000-0000-4000-a000-0000000000c1',
    };
    const moved = new MemoryOutputWriter();
    for (const [path, text] of writer.files) {
      moved.files.set(
        path.replace(cardTarget.folder, `projects/${project.projectId}/runs/${runKey}`),
        text,
      );
    }

    const cards = await new FilePriorCards(moved).cardsOf(project, runKey);

    expect(cards.map((card) => [card.id, card.type, card.area])).toEqual([
      ['FLOW-001', 'FLOW', 'orders'],
      ['SCRN-001', 'SCRN', 'orders'],
    ]);
  });
});
