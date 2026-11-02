import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { completedRun, deepenOf } from '../../support/deepen-run.js';
import { useSharedValue } from '../../support/understand-full-run.js';

// RF-209, RF-241, DEC-198 (1), EV-58: a picked answer is work for a Deepen on its own. Every claim of the
// completed run is supported, so the round plan has no re-read, gap, failed area or judgement; the
// Deepen still runs round 1 and reads Services with the answer, instead of ending `noProgress` with the
// question Open. Recorded responses only; no real provider is called.

async function deepenedWithOnlyAnAnswer(dir: string) {
  const { h, run } = await completedRun({
    dataDir: dir,
    recording: 'deepen-answers-only.json',
    verifierRecording: 'verifier-deepen-answers-only.json',
  });
  await h.answer(run, [{ cardId: 'OQ-001', answer: '', chosen: 2 }]);
  const started = await h.deepen(run, { coveragePass: false, maxRounds: 1 });
  if (!started.ok) throw new Error(started.error);
  return { h, run, deep: started.value };
}

const shared = useSharedValue('rosetta-deepen-only-', deepenedWithOnlyAnAnswer);

describe('DEC-198 a Deepen whose only work is a picked answer', () => {
  it('EV-58 runs round 1 and does not end noProgress', async () => {
    const { h, deep } = shared.current();

    const record = await deepenOf(h, deep);
    expect(record.stopReason).not.toBe('noProgress');
    expect(record.rounds).toHaveLength(1);
  });

  it('EV-58 records the answer and marks the question Answered', async () => {
    const { h, run, deep } = shared.current();

    expect((await deepenOf(h, deep)).rounds[0]?.answersUsed).toEqual([`${run.runKey}/OQ-001`]);
    const card = await readFile(join(h.runFolder(run), 'cards', 'OQ', 'OQ-001.md'), 'utf8');
    expect(card).toContain('State: Answered');
  });
});
