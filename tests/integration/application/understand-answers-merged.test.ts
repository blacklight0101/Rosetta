import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Run } from '../../../src/domain/runs/run.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT, useSharedValue } from '../../support/understand-full-run.js';
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

const temp = useTempRoot('rosetta-answers-merged-');
const areas = ['Catalog', 'Controllers', 'Services'];
const answer = 'The shop staff and the public, through the catalog pages.';

async function afterFirstRun(dataDir: string, extra: Partial<UnderstandHarnessOptions> = {}) {
  const h = await createUnderstandHarness({
    ...{ dataDir, recording: 'understand-questions-rerun.json' },
    ...extra,
  });
  await h.scan();
  const first = await h.understand({ areas });
  await h.answer(first, [{ cardId: 'OQ-001', answer }]);
  return { h, first };
}

/**
 * The runs the read-only tests share: the first run, the answer, the re-run with answers and a
 * third run after it. `before` and `beforeThird` are how many requests had been sent when the
 * re-run and the third run started.
 */
async function rerunsOf(dataDir: string) {
  const { h, first } = await afterFirstRun(dataDir);
  const before = h.providers.requests().length;
  const second = await h.understand({ withAnswers: true });
  const beforeThird = h.providers.requests().length;
  const third = await h.understand({ withAnswers: true });
  return { h, first, second, third, before, beforeThird };
}

const reruns = useSharedValue('rosetta-answers-merged-shared-', rerunsOf);

const questionCard = (h: UnderstandHarness, run: Run, id: string) =>
  readFile(join(h.runFolder(run), 'cards', 'OQ', `${id}.md`), 'utf8');

describe('a re-run with answers whose cards are merged', () => {
  it('RF-241 RF-250 lists the merged card as new and the changed card as changed', async () => {
    const { h, second } = reruns.current();

    expect(second.endState).toBe('Completed');
    const spec = await readFile(join(h.runFolder(second), 'spec.md'), 'utf8');
    expect(spec).toMatch(/## New cards\n\n- ENT-001 Catalog item\n/u);
    expect(spec).toMatch(/## Changed cards\n\n- FEAT-001 Item details page\n/u);
    expect(spec).not.toContain('ENT-002');
    expect(spec.split('## New cards')[1]).not.toContain('BR-001 Stock goes down');
  });

  it('RF-241 RF-250 marks the questions Answered after the merge was written', async () => {
    const { h, first } = reruns.current();

    expect(await questionCard(h, first, 'OQ-001')).toContain('State: Answered');
  });

  it(
    'RF-241 RF-250 keeps the questions Open when the merge cannot be written',
    UNDERSTAND_TIMEOUT,
    async () => {
      const { h, first } = await afterFirstRun(temp.path, { refuseRemoval: true });

      const second = await h.understand({ withAnswers: true });

      expect(second.endState).toBe('Failed');
      expect((await h.eventsOf(second)).at(-1)?.data).toMatchObject({
        errorCode: ERROR_CODES.pathOutsideRoot,
      });
      for (const id of ['OQ-001', 'OQ-002', 'OQ-003']) {
        expect(await questionCard(h, first, id)).toContain('State: Open');
      }
    },
  );
});

describe('a re-run with answers of a question that was merged in answers.md', () => {
  it('RF-241 RF-243 marks every OQ card behind the question Answered and no other', async () => {
    const { h, first } = reruns.current();

    for (const id of ['OQ-001', 'OQ-002', 'OQ-003']) {
      const text = await questionCard(h, first, id);
      expect(text).toContain('State: Answered');
      expect(text).toContain('questionState: "Answered"');
    }
    expect(await questionCard(h, first, 'OQ-004')).toContain('State: Open');
  });

  it('RF-241 RF-243 reads again every area that asked the question, each with the answer', async () => {
    const { h, second, before, beforeThird } = reruns.current();

    expect((await h.manifestOf(second)).agentTasks.map((task) => task.area)).toEqual(areas);
    const sent = h.providers.requests().slice(before, beforeThird);
    const asked = sent.filter((request) => request.messages[0]?.content.includes(answer));
    expect(new Set(asked.map((request) => request.messages[0]?.content)).size).toBe(3);
  });

  it('RF-241 RF-243 does not read an area again once its card is Answered', async () => {
    const { h, third, beforeThird } = reruns.current();

    expect((await h.manifestOf(third)).agentTasks).toEqual([]);
    expect(h.providers.requests()).toHaveLength(beforeThird);
  });
});
