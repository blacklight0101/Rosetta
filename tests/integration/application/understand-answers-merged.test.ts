import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Run } from '../../../src/domain/runs/run.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { useTempRoot } from '../../support/temp-root.js';
import {
  createUnderstandHarness,
  type UnderstandHarness,
  type UnderstandHarnessOptions,
} from '../../support/understand-run-harness.js';

// RF-241, RF-250, RF-243: a re-run with answers meets the two other changes to the cards. Three areas
// asked "Who uses the catalog pages?": `answers.md` holds the question once, the three OQ cards stay
// on disk. The owner answers it; the re-run reads the three areas again, marks the three cards
// Answered, and the summariser merges two ENT cards of the re-run. The lists of new and changed cards
// are those of the merged set, and a merge that cannot be written leaves every question Open.

const SLOW = { timeout: 90_000 };
const temp = useTempRoot('rosetta-answers-merged-');
const areas = ['Catalog', 'Controllers', 'Services'];
const answer = 'The shop staff and the public, through the catalog pages.';

async function afterFirstRun(extra: Partial<UnderstandHarnessOptions> = {}) {
  const h = await createUnderstandHarness({
    ...{ dataDir: temp.path, recording: 'understand-questions-rerun.json' },
    ...extra,
  });
  await h.scan();
  const first = await h.understand({ areas });
  await h.answer(first, [{ cardId: 'OQ-001', answer }]);
  return { h, first };
}

const questionCard = (h: UnderstandHarness, run: Run, id: string) =>
  readFile(join(h.runFolder(run), 'cards', 'OQ', `${id}.md`), 'utf8');

describe('a re-run with answers whose cards are merged', SLOW, () => {
  it('RF-241 RF-250 lists the merged card as new and the changed card as changed', async () => {
    const { h } = await afterFirstRun();

    const second = await h.understand({ withAnswers: true });

    expect(second.endState).toBe('Completed');
    const spec = await readFile(join(h.runFolder(second), 'spec.md'), 'utf8');
    expect(spec).toMatch(/## New cards\n\n- ENT-001 Catalog item\n/u);
    expect(spec).toMatch(/## Changed cards\n\n- FEAT-001 Item details page\n/u);
    expect(spec).not.toContain('ENT-002');
    expect(spec.split('## New cards')[1]).not.toContain('BR-001 Stock goes down');
  });

  it('RF-241 RF-250 marks the questions Answered after the merge was written', async () => {
    const { h, first } = await afterFirstRun();

    await h.understand({ withAnswers: true });

    expect(await questionCard(h, first, 'OQ-001')).toContain('State: Answered');
  });

  it('RF-241 RF-250 keeps the questions Open when the merge cannot be written', async () => {
    const { h, first } = await afterFirstRun({ refuseRemoval: true });

    const second = await h.understand({ withAnswers: true });

    expect(second.endState).toBe('Failed');
    expect((await h.eventsOf(second)).at(-1)?.data).toMatchObject({
      errorCode: ERROR_CODES.pathOutsideRoot,
    });
    for (const id of ['OQ-001', 'OQ-002', 'OQ-003']) {
      expect(await questionCard(h, first, id)).toContain('State: Open');
    }
  });
});

describe('a re-run with answers of a question that was merged in answers.md', SLOW, () => {
  it('RF-241 RF-243 marks every OQ card behind the question Answered and no other', async () => {
    const { h, first } = await afterFirstRun();

    await h.understand({ withAnswers: true });

    for (const id of ['OQ-001', 'OQ-002', 'OQ-003']) {
      const text = await questionCard(h, first, id);
      expect(text).toContain('State: Answered');
      expect(text).toContain('questionState: "Answered"');
    }
    expect(await questionCard(h, first, 'OQ-004')).toContain('State: Open');
  });

  it('RF-241 RF-243 reads again every area that asked the question, each with the answer', async () => {
    const { h } = await afterFirstRun();
    const before = h.providers.requests().length;

    const second = await h.understand({ withAnswers: true });

    expect((await h.manifestOf(second)).agentTasks.map((task) => task.area)).toEqual(areas);
    const sent = h.providers.requests().slice(before);
    const asked = sent.filter((request) => request.messages[0]?.content.includes(answer));
    expect(new Set(asked.map((request) => request.messages[0]?.content)).size).toBe(3);
  });

  it('RF-241 RF-243 does not read an area again once its card is Answered', async () => {
    const { h } = await afterFirstRun();
    await h.understand({ withAnswers: true });
    const before = h.providers.requests().length;

    const third = await h.understand({ withAnswers: true });

    expect((await h.manifestOf(third)).agentTasks).toEqual([]);
    expect(h.providers.requests()).toHaveLength(before);
  });
});
