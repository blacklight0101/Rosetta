import { describe, expect, it } from 'vitest';
import { overallOf, parseJudgeReply } from '../../../../../src/application/lab/judge/judgement.js';
import type { Rubric } from '../../../../../src/application/lab/judge/rubric.js';
import { judgeReply } from '../../../../support/judge-harness.js';

// RF-1404: the judge's reply must score every criterion of the rubric; the lab computes the overall.

const rubric: Rubric = {
  ...{ family: 'shared', sha256: '0'.repeat(64), text: 'x' },
  criteria: [
    { id: 'grounding', title: 'G', veto: false },
    { id: 'coverage', title: 'C', veto: false },
    { id: 'secret-detection', title: 'S', veto: true },
  ],
};
const ids = rubric.criteria.map((each) => each.id);

describe('the judge reply', () => {
  it('RF-1404 reads a score and a reason for every criterion, also inside a code fence', () => {
    const reply = `\`\`\`json\n${judgeReply(ids, { coverage: 2 })}\n\`\`\``;

    const parsed = parseJudgeReply(reply, rubric);

    expect(parsed.ok && parsed.value.map((each) => [each.id, each.score])).toEqual([
      ['grounding', 4],
      ['coverage', 2],
      ['secret-detection', 4],
    ]);
  });

  it('RF-1404 refuses text that is no JSON, a missing or extra criterion and a score out of range', () => {
    const missing = judgeReply(ids.slice(0, 2));
    const extra = judgeReply([...ids, 'style']);
    const high = judgeReply(ids, { coverage: 6 });
    const fraction = judgeReply(ids, { coverage: 3.5 });

    for (const text of ['Looks good.', missing, extra, high, fraction]) {
      expect(parseJudgeReply(text, rubric).ok).toBe(false);
    }
  });

  it('RF-1404 computes the overall as the mean to one decimal and a veto criterion at 1 makes it 1', () => {
    const scored = (secret: number) => {
      const reply = judgeReply(ids, { coverage: 3, 'secret-detection': secret });
      const parsed = parseJudgeReply(reply, rubric);
      return parsed.ok ? overallOf(parsed.value, rubric) : undefined;
    };

    expect(scored(5)).toEqual({ overall: 4, vetoed: false });
    expect(scored(2)).toEqual({ overall: 3, vetoed: false });
    expect(scored(1)).toEqual({ overall: 1, vetoed: true });
  });
});
