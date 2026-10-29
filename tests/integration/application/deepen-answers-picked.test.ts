import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { completedRun, deepenOf } from '../../support/deepen-run.js';
import { useSharedValue } from '../../support/understand-full-run.js';

// RF-209, RF-241, DEC-198 (1), EV-58: a suggested answer the owner picked reaches a Deepen like a typed
// one. The completed run raised one open question with suggested answers in Services; the owner picked
// the second option. The only rejected claim is in Catalog, so Services has no re-read, gap or failed
// area; the Deepen still reads Services with the answer and marks the question Answered. Recorded
// responses only; no real provider is called.

async function deepenedWithPickedAnswer(dir: string) {
  const { h, run } = await completedRun({
    dataDir: dir,
    recording: 'deepen-answers-picked.json',
    verifierRecording: 'verifier-deepen-answers-picked.json',
  });
  await h.answer(run, [{ cardId: 'OQ-001', answer: '', chosen: 2 }]);
  const before = h.providers.requests().length;
  const started = await h.deepen(run, { coveragePass: false, maxRounds: 1 });
  if (!started.ok) throw new Error(started.error);
  return { h, run, deep: started.value, before };
}

const shared = useSharedValue('rosetta-deepen-picked-', deepenedWithPickedAnswer);

describe('DEC-198 a Deepen over an area with a picked answer and no re-read', () => {
  it('EV-58 gives a reader task of Services the question and the text of the picked option', () => {
    const { h, before } = shared.current();

    const asked = h.providers.requests().slice(before);
    const message = asked.find((request) => request.context.agentTaskId === 'reader-004')
      ?.messages[0]?.content;
    expect(message).toContain('Is a sold-out item shown in the list?');
    expect(message).toContain("Owner's answer: No, hide it");
  });

  it('EV-58 records the picked answer among the answers the round used', async () => {
    const { h, run, deep } = shared.current();

    const record = await deepenOf(h, deep);
    expect(record.rounds[0]?.answersUsed).toEqual([`${run.runKey}/OQ-001`]);
  });

  it('RF-241 marks the picked question Answered in the run that raised it', async () => {
    const { h, run } = shared.current();

    const card = await readFile(join(h.runFolder(run), 'cards', 'OQ', 'OQ-001.md'), 'utf8');
    expect(card).toContain('State: Answered');
  });
});
