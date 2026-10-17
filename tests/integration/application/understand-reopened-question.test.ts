import { describe, expect, it } from 'vitest';
import type { Run } from '../../../src/domain/runs/run.js';
import { useTempRoot } from '../../support/temp-root.js';
import {
  createUnderstandHarness,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-241, RF-1007: an answer edited after its question was marked Answered is used only when the
// question is reopened; the re-run then reads the area again with the edited answer.

const SLOW = { timeout: 90_000 };
const temp = useTempRoot('rosetta-understand-reopen-');
const answer = 'Yes, sold-out items stay on the home page; the shop wants them shown.';
const edited = 'No: sold-out items are hidden from the home page since the May change.';

async function areasOf(h: UnderstandHarness, run: Run): Promise<string[]> {
  return (await h.manifestOf(run)).agentTasks.map((task) => task.area);
}

async function answeredOnce() {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording: 'understand-csharp-full.json',
    afterwards: 'understand-csharp-answers.json',
  });
  await h.scan();
  const first = await h.understand();
  await h.answer(first, [{ cardId: 'OQ-001', answer }]);
  await h.understand({ withAnswers: true });
  await h.answer(first, [{ cardId: 'OQ-001', answer: edited }]);
  return { h, first };
}

describe('a re-run after an answered question is reopened', SLOW, () => {
  it('RF-241 reads the area again with the edited answer', async () => {
    const { h, first } = await answeredOnce();
    expect(await h.reopen(first, ['OQ-001'])).toEqual(['OQ-001']);
    const before = h.providers.requests().length;

    const third = await h.understand({ withAnswers: true });

    expect(await areasOf(h, third)).toEqual(['(root)']);
    const sent = h.providers.requests().slice(before);
    expect(sent[0]?.messages[0]?.content ?? '').toContain(edited);
  });

  it('RF-241 does not read the area again while the question stays Answered', async () => {
    const { h } = await answeredOnce();

    const third = await h.understand({ withAnswers: true });

    expect(await areasOf(h, third)).toEqual([]);
  });
});
