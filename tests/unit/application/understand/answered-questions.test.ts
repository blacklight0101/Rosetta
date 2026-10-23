import { describe, expect, it } from 'vitest';
import { withoutAnsweredQuestions } from '../../../../src/application/understand/answered-questions.js';
import type { Logger, LogRecord } from '../../../../src/application/ports/logger.js';
import type { RepositoryReader } from '../../../../src/application/ports/repository-reader.js';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import { TaskLog } from '../../../../src/application/understand/task-log.js';
import type { CardDraft } from '../../../../src/domain/cards/card-ids.js';
import { ok } from '../../../../src/domain/errors/result.js';

// RF-243, P5-02 (EV-09): the filter reads the lines an open question cites; a question those lines
// define is dropped and logged by the real TaskLog with its reason, never silently; a genuine
// question is kept.

const files: Record<string, readonly string[]> = {
  'assets.md': ['A: Asset tag', 'B: Description', 'C: Location', 'D: Qty'],
  'other.md': ['nothing here'],
};
const reader: Pick<RepositoryReader, 'readLines'> = {
  readLines: (request) =>
    Promise.resolve(
      ok({
        ...request,
        totalLines: 4,
        lines: (files[request.path] ?? []).slice(request.startLine - 1, request.endLine),
      }),
    ),
};
const task = { area: { name: 'Assets' }, agentTaskId: 'T1' } as unknown as ReaderTask;

function question(text: string, ...cited: string[]): CardDraft {
  return {
    type: 'OQ',
    title: 'q',
    summary: 's',
    area: 'Assets',
    confidence: 'Low',
    question: text,
    whyItMatters: 'w',
    claims: [{ text: 'c', citations: cited.map((path) => ({ path, startLine: 1, endLine: 4 })) }],
  };
}

function logged() {
  const records: LogRecord[] = [];
  const logger = {
    log: (record: LogRecord) => {
      records.push(record);
      return Promise.resolve();
    },
  } as unknown as Logger;
  return { log: new TaskLog(logger, 'run-1'), records };
}

describe('open questions the cited lines define', () => {
  it('RF-243 P5-02 drops the column D question and the real task log names it, the name and the citation', async () => {
    const { log, records } = logged();
    const asked = question('What does column D ("Qty") represent?', 'assets.md');

    const result = await withoutAnsweredQuestions(log, reader, task, { drafts: [asked] });

    expect(result.drafts).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ level: 'warn', agentTaskId: 'T1' });
    expect(records[0]?.message).toContain('What does column D ("Qty") represent?');
    expect(records[0]?.message).toContain('"Qty"');
    expect(records[0]?.message).toContain('assets.md:1-4');
  });

  it('RF-243 P5-02 logs the citation where the name was found, not the first one', async () => {
    const { log, records } = logged();
    const asked = question('What does column D ("Qty") represent?', 'other.md', 'assets.md');

    await withoutAnsweredQuestions(log, reader, task, { drafts: [asked] });

    expect(records[0]?.message).toContain('assets.md:1-4');
    expect(records[0]?.message).not.toContain('other.md');
  });
});

describe('open questions the cited lines do not define', () => {
  it('RF-243 P5-02 keeps a genuine question and logs nothing', async () => {
    const { log, records } = logged();
    const asked = question('Why is the "Qty" column capped at 99 units per asset?', 'assets.md');

    const result = await withoutAnsweredQuestions(log, reader, task, { drafts: [asked] });

    expect(result.drafts).toEqual([asked]);
    expect(records).toEqual([]);
  });

  it('RF-243 P5-02 keeps the other card types untouched', async () => {
    const { log } = logged();
    const card: CardDraft = { ...question('x', 'assets.md'), type: 'BR' };

    const result = await withoutAnsweredQuestions(log, reader, task, { drafts: [card] });

    expect(result.drafts).toEqual([card]);
  });

  it('RF-243 P5-02 keeps a question whose cited lines cannot be read', async () => {
    const { log } = logged();
    const broken: Pick<RepositoryReader, 'readLines'> = {
      readLines: () => Promise.reject(new Error('gone')),
    };
    const asked = question('What does column D ("Qty") represent?', 'assets.md');

    const result = await withoutAnsweredQuestions(log, broken, task, { drafts: [asked] });

    expect(result.drafts).toEqual([asked]);
  });
});
