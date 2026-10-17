import { describe, expect, it } from 'vitest';
import { FilePriorCards } from '../../../../src/infrastructure/cards/prior-cards.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { seedQuestionCards } from '../../../support/question-cards.js';

// RF-241, data-model.md section 3.7: a question marked Answered can be reopened, so an answer edited
// after that is used by the next re-run. Only an Answered OQ card of the run's own folder changes.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const runKey = '20261012-100000-understand';
const folder = `projects/${project.projectId}/runs/${runKey}`;

function setup(state: 'Open' | 'Answered') {
  const writer = new MemoryOutputWriter();
  seedQuestionCards(writer, project, runKey, [{ id: 'OQ-001', area: 'Catalog', state }]);
  return { writer, cards: new FilePriorCards(writer) };
}

describe('reopening an answered question', () => {
  it('RF-241 marks an answered question open again in its header and body, once', async () => {
    const { writer, cards } = setup('Answered');
    const answered = writer.files.get(`${folder}/cards/OQ/OQ-001.md`) ?? '';

    expect(await cards.reopen(project, runKey, ['OQ-001'])).toEqual(['OQ-001']);

    const reopened = writer.files.get(`${folder}/cards/OQ/OQ-001.md`) ?? '';
    expect(reopened).toContain('questionState: "Open"');
    expect(reopened).toContain('\nState: Open\n');
    expect(reopened).toBe(
      answered.replace('"Answered"', '"Open"').replace('State: Answered', 'State: Open'),
    );
    expect(await cards.reopen(project, runKey, ['OQ-001'])).toEqual([]);
  });

  it('RF-241 leaves an open question as it is', async () => {
    const { writer, cards } = setup('Open');
    const before = writer.files.get(`${folder}/cards/OQ/OQ-001.md`);

    expect(await cards.reopen(project, runKey, ['OQ-001'])).toEqual([]);
    expect(writer.files.get(`${folder}/cards/OQ/OQ-001.md`)).toBe(before);
  });

  it('RF-241 reopens nothing for a run key that is not a run folder or a card id with a path', async () => {
    const { writer, cards } = setup('Answered');
    const outside = `${folder}/cards/OQ/../index.md`;
    writer.files.set(outside, writer.files.get(`${folder}/cards/OQ/OQ-001.md`) ?? '');

    expect(await cards.reopen(project, '../other', ['OQ-001'])).toEqual([]);
    expect(await cards.reopen(project, runKey, ['../index', 'FEAT-001'])).toEqual([]);
    expect(writer.files.get(outside)).toContain('State: Answered');
  });
});
