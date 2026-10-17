import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-241: a re-run with answers logs each answered question it leaves out. Here the question was
// already marked Answered by an earlier re-run, so the third run has nothing to do and says why.

const SLOW = { timeout: 90_000 };
const temp = useTempRoot('rosetta-understand-skipped-');

describe('an understand run with the answers option that skips a question', SLOW, () => {
  it('RF-241 logs the question it leaves out because it is already Answered', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-csharp-full.json',
      afterwards: 'understand-csharp-answers.json',
    });
    await h.scan();
    const first = await h.understand();
    await h.answer(first, [{ cardId: 'OQ-001', answer: 'Yes, they stay listed.' }]);
    await h.understand({ withAnswers: true });

    const third = await h.understand({ withAnswers: true });

    const lines = h.logger.entries.filter((entry) => entry.runId === third.runKey);
    expect(lines.map((entry) => [entry.level, entry.message])).toContainEqual([
      'warn',
      expect.stringMatching(/OQ-001.*already Answered/iu),
    ]);
  });
});
