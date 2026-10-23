import { describe, expect, it } from 'vitest';
import { withoutAnsweredQuestions } from '../../../../src/application/understand/answered-questions.js';
import type { RepositoryReader } from '../../../../src/application/ports/repository-reader.js';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import type { TaskLog } from '../../../../src/application/understand/task-log.js';
import type { CardDraft } from '../../../../src/domain/cards/card-ids.js';
import { ok } from '../../../../src/domain/errors/result.js';

// RF-243, P5-02 (EV-09): the filter reads the lines an open question cites; a question those lines
// answer is dropped and logged with its reason, never silently; a genuine question is kept.

const lines = ['A: Asset tag', 'B: Description', 'C: Location', 'D: Qty'];
const reader: Pick<RepositoryReader, 'readLines'> = {
  readLines: (request) =>
    Promise.resolve(
      ok({
        ...request,
        totalLines: lines.length,
        lines: lines.slice(request.startLine - 1, request.endLine),
      }),
    ),
};
const task = { area: { name: 'Assets' }, agentTaskId: 'T1' } as unknown as ReaderTask;

function question(text: string): CardDraft {
  return {
    type: 'OQ',
    title: 'q',
    summary: 's',
    area: 'Assets',
    confidence: 'Low',
    question: text,
    whyItMatters: 'w',
    claims: [{ text: 'c', citations: [{ path: 'assets.md', startLine: 1, endLine: 4 }] }],
  };
}

function recorder() {
  const logged: { question: string; name: string; citation: string }[] = [];
  const log = {
    answeredQuestions: (
      _task: ReaderTask,
      refused: { question: string; name: string; citation: string }[],
    ) => {
      logged.push(...refused);
      return Promise.resolve();
    },
  } as unknown as TaskLog;
  return { log, logged };
}

describe('open questions the cited lines answer', () => {
  it('RF-243 P5-02 drops the column D question and logs it with the name found', async () => {
    const { log, logged } = recorder();
    const asked = question('What does column D ("Qty") represent?');

    const result = await withoutAnsweredQuestions(log, reader, task, { drafts: [asked] });

    expect(result.drafts).toEqual([]);
    expect(logged).toEqual([
      { question: 'What does column D ("Qty") represent?', name: 'Qty', citation: 'assets.md:1-4' },
    ]);
  });

  it('RF-243 P5-02 keeps a genuine question and logs nothing', async () => {
    const { log, logged } = recorder();
    const asked = question('Why is the "Qty" column capped at 99 units per asset?');

    const result = await withoutAnsweredQuestions(log, reader, task, { drafts: [asked] });

    expect(result.drafts).toEqual([asked]);
    expect(logged).toEqual([]);
  });

  it('RF-243 P5-02 keeps a question whose cited lines cannot be read', async () => {
    const { log } = recorder();
    const broken: Pick<RepositoryReader, 'readLines'> = {
      readLines: () => Promise.reject(new Error('gone')),
    };
    const asked = question('What does column D ("Qty") represent?');

    const result = await withoutAnsweredQuestions(log, broken, task, { drafts: [asked] });

    expect(result.drafts).toEqual([asked]);
  });
});
