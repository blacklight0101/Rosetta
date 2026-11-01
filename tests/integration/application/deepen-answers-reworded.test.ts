import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { completedRun } from '../../support/deepen-run.js';
import { useSharedValue } from '../../support/understand-full-run.js';
import type { UnderstandHarness } from '../../support/understand-run-harness.js';
import type { Run } from '../../../src/domain/runs/run.js';

// RF-646, RF-243, Q-52, DEC-179, P7-09, EV-57, ADR-008: the Deepen reader raises an answered question
// again in other words (two extra words) under a new id, and the run asks it once. Synthetic
// recording; no real provider is called.

const answer = 'Yes, the shop wants one fixed name on every product page; ignore the stock text.';

async function deepened(dir: string) {
  const { h, run } = await completedRun({
    dataDir: dir,
    recording: 'deepen-answers-reworded.json',
    verifierRecording: 'verifier-deepen-answers.json',
  });
  await h.answer(run, [{ cardId: 'OQ-001', answer }]);
  const started = await h.deepen(run, { coveragePass: false, maxRounds: 1 });
  if (!started.ok) throw new Error(started.error);
  return { h, run, deep: started.value };
}

const shared = useSharedValue('rosetta-deepen-reworded-', deepened);

const cardFile = (h: UnderstandHarness, run: Run, id: string) =>
  readFile(join(h.runFolder(run), 'cards', 'OQ', `${id}.md`), 'utf8');

describe('RF-646 P7-09 a question raised again in other words is not asked again', () => {
  it('RF-646 keeps one section in answers.md, still answered', async () => {
    const { h } = shared.current();

    const text = await readFile(join(h.projectFolder(), 'answers.md'), 'utf8');
    expect(text.match(/^## /gmu)).toHaveLength(1);
    expect(text).toContain(`- Answer: ${answer}`);
  });

  it('RF-243 merges the card of the reworded question into the answered one', async () => {
    const { h, deep } = shared.current();

    expect(await cardFile(h, deep, 'OQ-001')).toContain('State: Answered');
    await expect(cardFile(h, deep, 'OQ-002')).rejects.toThrow();
  });
});
