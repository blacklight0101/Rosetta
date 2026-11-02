import { describe, expect, it } from 'vitest';
import {
  answersCapNote,
  withAnswersOf,
  type RerunPlan,
} from '../../../../src/application/understand/answer-rerun.js';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';

// RF-209, RF-646, EV-57, P8-05: the answered questions given to a Deepen reader are capped by size,
// newest run first, its own area first; the cap is named in the run log.

const task = {
  agentTaskId: 'reader-001',
  area: { name: 'Catalog', files: [], estimatedTokens: 1 },
} as unknown as ReaderTask;

function planOf(runs: number): RerunPlan {
  const pending = Array.from({ length: runs }, (_, index) => ({
    cardId: 'OQ-001',
    runKey: `2026100${String(index + 1)}-100000-understand`,
    area: index === 0 ? 'Catalog' : 'Other',
    question: `Question of run ${String(index + 1)}?`,
    answer: 'x'.repeat(3000),
    context: '',
  }));
  return { project: { userId: 'u', projectId: 'p' }, pending, skipped: [], baseline: [] };
}

describe('P8-05 the cap on the answers a Deepen reader gets', () => {
  it('keeps its own area first, then the newest runs, and drops the oldest', () => {
    const text = withAnswersOf([task], planOf(9), true)[0]?.answers ?? '';
    expect(text.length).toBeLessThan(9 * 3000);
    expect(text).toContain('Question of run 1?');
    expect(text).toContain('Question of run 9?');
    expect(text).not.toContain('Question of run 2?');
    expect(text.indexOf('run 1?')).toBeLessThan(text.indexOf('run 9?'));
  });
  it('does not cut a plan that fits', () => {
    expect(withAnswersOf([task], planOf(2), true)[0]?.answers).toContain('Question of run 2?');
    expect(answersCapNote(planOf(2))).toBeUndefined();
  });
  it('names the cap and the number left out in the log', () => {
    expect(answersCapNote(planOf(9))).toMatch(/capped at 12000 characters.*left out/u);
  });
});
