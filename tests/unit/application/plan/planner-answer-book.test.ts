import { describe, expect, it } from 'vitest';
import { PlannerAnswerBook } from '../../../../src/application/plan/planner-answer-book.js';
import type {
  KeptAnswers,
  PlannerAnswers,
} from '../../../../src/application/ports/planner-answers.js';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-432, RF-408, P8-01: the answers a paused plan run paid for are handed back only for the same
// inputs; a changed brief, answer, card or setting drops them all. A cut-off answer keeps each
// segment it paid for, and call ids go on from the last one the run took.

class MemoryAnswers implements PlannerAnswers {
  kept: KeptAnswers | undefined;

  read(): Promise<KeptAnswers | undefined> {
    return Promise.resolve(this.kept);
  }

  write(_scope: unknown, kept: KeptAnswers): Promise<void> {
    this.kept = kept;
    return Promise.resolve();
  }

  fingerprint(inputs: string): string {
    return `fp:${inputs}`;
  }
}

const run = sampleRun({ runKey: 'run-1' });
const scope = scopeOf(run);

/** One attempt of a run: opens the book for `inputs` and asks the calls in order. */
async function attempt(store: MemoryAnswers, inputs: string, tasks: readonly string[]) {
  const book = await PlannerAnswerBook.open(store, scope, inputs);
  const asked: string[] = [];
  const nextId = book.callIds(run);
  const answers: string[] = [];
  for (const task of tasks) {
    answers.push(
      await book.answerOf(task, () => {
        asked.push(task);
        return Promise.resolve(`${inputs}:${task}:${nextId()}`);
      }),
    );
  }
  await book.saved();
  return { book, asked, answers };
}

describe('the planner answers of a plan run', () => {
  it('RF-432 P8-01 hands back the answers kept for the same inputs and asks only the rest', async () => {
    const store = new MemoryAnswers();
    await attempt(store, 'brief-1', ['planner-package']);

    const again = await attempt(store, 'brief-1', ['planner-package', 'planner-prd']);

    expect(again.book.start).toEqual({ state: 'reused', answers: 1 });
    expect(again.asked).toEqual(['planner-prd']);
    expect(again.answers).toEqual([
      'brief-1:planner-package:run-1#1',
      'brief-1:planner-prd:run-1#2',
    ]);
  });

  it('RF-432 P8-01 drops every kept answer when the inputs changed during the pause', async () => {
    const store = new MemoryAnswers();
    await attempt(store, 'brief-1', ['planner-package', 'planner-prd']);

    const edited = await attempt(store, 'brief-2', ['planner-package', 'planner-prd']);

    expect(edited.book.start).toEqual({ state: 'discarded', answers: 2 });
    expect(edited.asked).toEqual(['planner-package', 'planner-prd']);
    expect(edited.answers.every((answer) => answer.startsWith('brief-2:'))).toBe(true);
    expect(store.kept?.inputs).toBe('fp:brief-2');
  });

  it('RF-408 P8-01 numbers call ids on from the last one the run took, also after a discard', async () => {
    const store = new MemoryAnswers();
    await attempt(store, 'brief-1', ['planner-package', 'planner-prd']);

    const edited = await attempt(store, 'brief-2', ['planner-package']);

    expect(edited.answers).toEqual(['brief-2:planner-package:run-1#3']);
    expect(store.kept?.callsTaken).toBe(3);
  });
});

describe('a cut-off answer of a plan run', () => {
  it('RF-432 P8-01 goes on from the last segment of a cut-off answer it paid for', async () => {
    const store = new MemoryAnswers();
    const first = await PlannerAnswerBook.open(store, scope, 'brief-1');
    const paused = first.answerOf('planner-package', async (progress, keep) => {
      expect(progress).toBeUndefined();
      await keep({ text: '{"requirements": [', continued: 0 });
      throw new Error('The run paused at its approved amount.');
    });
    await expect(paused).rejects.toThrow('paused');

    const second = await PlannerAnswerBook.open(store, scope, 'brief-1');
    const answer = await second.answerOf('planner-package', (progress) =>
      Promise.resolve(`${progress?.text ?? ''}]}`),
    );

    expect(answer).toBe('{"requirements": []}');
    expect(store.kept?.progress).toEqual({});
    expect(store.kept?.answers).toEqual({ 'planner-package#1': '{"requirements": []}' });
  });
});
