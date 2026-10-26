import { appendFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import {
  SecretMasker,
  type MaskResult,
  type TextMasker,
} from '../../../../src/infrastructure/guards/secret-masker.js';
import { FileRunCallReader } from '../../../../src/infrastructure/providers/file-run-call-reader.js';
import { sampleRecord } from '../../../contracts/provider-call-recorder.contract.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1011, RF-408, RF-1105 (P5-22): the reader parses the call log of a run once and keeps it. The
// parses are counted through the masker, which every line passes through once per parse, so the
// tests do not depend on how fast the machine is.

const root = useTempRoot('rosetta-call-cache-');

const amy = '00000000-0000-4000-9000-0000000000a1';
const projectId = '00000000-0000-4000-a000-0000000000a1';
const runKeyOf = (n: number): string => `2026101${String(n)}-090503-understand`;
const scopeOf = (n: number): RunScope => ({
  id: `00000000-0000-4000-b000-00000000000${String(n)}`,
  userId: amy,
  projectId,
  runKey: runKeyOf(n),
});
const runDirOf = (n: number): string =>
  join(root.path, 'users', amy, 'projects', projectId, 'runs', runKeyOf(n));

/** Counts the texts the reader masks: one line of a log is many of them, and none when it is kept. */
class CountingMasker implements TextMasker {
  count = 0;
  private readonly inner = new SecretMasker();
  mask(text: string): MaskResult {
    this.count += 1;
    return this.inner.mask(text);
  }
}

function setup(options: { readonly runsKept?: number } = {}) {
  const masker = new CountingMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
  const reader = new FileRunCallReader({
    reader: new NodeOutputWriter({ dataDir: root.path, logger }),
    masker,
    ...options,
  });
  return { masker, reader };
}

function callLine(seq: number, agentTaskId = 'task-1'): string {
  const record = {
    ...sampleRecord,
    callId: `${runKeyOf(1)}#${String(seq)}`,
    agentTaskId,
    latencyMs: 1000 + seq,
  };
  return `${JSON.stringify({ schemaVersion: 1, seq, ...record })}\n`;
}

async function appendCalls(n: number, from: number, count: number, task = 'task-1'): Promise<void> {
  await mkdir(runDirOf(n), { recursive: true });
  const lines = Array.from({ length: count }, (_item, index) => callLine(from + index, task));
  await appendFile(join(runDirOf(n), 'provider-calls.jsonl'), lines.join(''), 'utf8');
}

async function appendTranscript(
  n: number,
  task: string,
  entries: readonly { seq: number; callId: string }[],
): Promise<void> {
  await mkdir(join(runDirOf(n), 'transcripts'), { recursive: true });
  const lines = entries.map(({ seq, callId }) =>
    JSON.stringify({
      schemaVersion: 1,
      seq,
      at: sampleRecord.startedAt,
      callId,
      role: 'user',
      content: `Message ${String(seq)}`,
    }),
  );
  await appendFile(
    join(runDirOf(n), 'transcripts', `${task}.jsonl`),
    `${lines.join('\n')}\n`,
    'utf8',
  );
}

describe('FileRunCallReader keeps the call log of a run', () => {
  it('RF-1011 parses the call log once however many times it is read', async () => {
    await appendCalls(1, 1, 40);
    const { reader, masker } = setup();

    const first = await reader.log(scopeOf(1));
    const afterFirst = masker.count;
    const second = await reader.log(scopeOf(1));
    await reader.log(scopeOf(1));

    expect(first.calls).toHaveLength(40);
    expect(afterFirst).toBeGreaterThan(0);
    expect(masker.count).toBe(afterFirst);
    expect(second.calls).toEqual(first.calls);
  });

  it('RF-1011 finds a call by its seq and pages by seq without reading anything again', async () => {
    await appendCalls(1, 1, 40);
    const { reader, masker } = setup();
    const log = await reader.log(scopeOf(1));
    const parsed = masker.count;

    expect(log.find(7)?.callId).toBe(`${runKeyOf(1)}#7`);
    expect(log.find(41)).toBeUndefined();
    expect(log.page(0, 3).map((call) => call.seq)).toEqual([1, 2, 3]);
    expect(log.page(38, 50).map((call) => call.seq)).toEqual([39, 40]);
    expect(log.page(40, 5)).toEqual([]);
    expect(masker.count).toBe(parsed);
  });

  it('RF-1011 computes the summary per role once for a version of the log', async () => {
    await appendCalls(1, 1, 10);
    const { reader } = setup();

    const log = await reader.log(scopeOf(1));
    const again = await reader.log(scopeOf(1));

    expect(log.summary).toHaveLength(1);
    expect(log.summary[0]).toMatchObject({ provider: 'local', role: 'reader', calls: 10 });
    expect(again.summary).toBe(log.summary);
  });
});

describe('FileRunCallReader keeps a growing call log', () => {
  it('RF-1011 parses only the new lines when the log of a running run grows', async () => {
    await appendCalls(1, 1, 50);
    const { reader, masker } = setup();
    await reader.log(scopeOf(1));
    const full = masker.count;

    await appendCalls(1, 51, 2);
    const grown = await reader.log(scopeOf(1));

    expect(grown.calls.map((call) => call.seq).slice(-3)).toEqual([50, 51, 52]);
    expect(grown.summary[0]?.calls).toBe(52);
    expect(masker.count - full).toBeLessThan(full / 10);
    expect(masker.count - full).toBeGreaterThan(0);
  });

  it('RF-1011 shows a line that was torn when it is completed', async () => {
    await appendCalls(1, 1, 2);
    const { reader } = setup();
    const file = join(runDirOf(1), 'provider-calls.jsonl');
    const third = callLine(3);
    await appendFile(file, third.slice(0, 40), 'utf8');

    expect((await reader.log(scopeOf(1))).calls.map((call) => call.seq)).toEqual([1, 2]);
    await appendFile(file, third.slice(40), 'utf8');

    expect((await reader.log(scopeOf(1))).calls.map((call) => call.seq)).toEqual([1, 2, 3]);
  });
});

describe('FileRunCallReader keeps the call log: rewrites', () => {
  it('RF-1011 does not serve a stale log when the file was rewritten and is now larger', async () => {
    await appendCalls(1, 1, 2);
    const { reader } = setup();
    expect((await reader.log(scopeOf(1))).calls.map((call) => call.seq)).toEqual([1, 2]);

    const rewritten = [11, 12, 13, 14, 15].map((seq) => callLine(seq)).join('');
    await writeFile(join(runDirOf(1), 'provider-calls.jsonl'), rewritten, 'utf8');

    expect((await reader.log(scopeOf(1))).calls.map((call) => call.seq)).toEqual([
      11, 12, 13, 14, 15,
    ]);
  });

  it('RF-1011 forgets a run whose call log is gone and reads it again when it comes back', async () => {
    await appendCalls(1, 1, 5);
    const { reader, masker } = setup();
    await reader.log(scopeOf(1));
    await rm(runDirOf(1), { recursive: true });

    expect((await reader.log(scopeOf(1))).calls).toEqual([]);
    await appendCalls(1, 1, 5);
    const before = masker.count;

    expect((await reader.log(scopeOf(1))).calls).toHaveLength(5);
    expect(masker.count).toBeGreaterThan(before);
  });
});

describe('FileRunCallReader keeps a few runs', () => {
  it('RF-1011 keeps only a few runs, the ones read last', async () => {
    await appendCalls(1, 1, 3);
    await appendCalls(2, 1, 3);
    await appendCalls(3, 1, 3);
    const { reader, masker } = setup({ runsKept: 2 });
    await reader.log(scopeOf(1));
    await reader.log(scopeOf(2));
    await reader.log(scopeOf(3));
    const parsed = masker.count;

    await reader.log(scopeOf(3));
    await reader.log(scopeOf(2));
    expect(masker.count).toBe(parsed);
    await reader.log(scopeOf(1));

    expect(masker.count).toBeGreaterThan(parsed);
  });

  it('RF-1105 does not give a user the cached log of another user', async () => {
    await appendCalls(1, 1, 3);
    const { reader } = setup();
    await reader.log(scopeOf(1));
    const bob = '00000000-0000-4000-9000-0000000000b2';

    expect((await reader.log({ ...scopeOf(1), userId: bob })).calls).toEqual([]);
  });
});

describe('FileRunCallReader keeps the transcript of an agent task', () => {
  it('RF-1011 reads a transcript once and reads only the task that is asked for', async () => {
    await appendTranscript(1, 'task-1', [
      { seq: 1, callId: 'c#1' },
      { seq: 2, callId: 'c#2' },
    ]);
    await appendTranscript(1, 'task-2', [{ seq: 1, callId: 'c#3' }]);
    const { reader, masker } = setup();

    const first = await reader.transcript(scopeOf(1), 'task-1');
    const parsed = masker.count;
    const second = await reader.transcript(scopeOf(1), 'task-1');

    expect(first.map((entry) => entry.callId)).toEqual(['c#1', 'c#2']);
    expect(second).toEqual(first);
    expect(masker.count).toBe(parsed);
    await reader.transcript(scopeOf(1), 'task-2');
    expect(masker.count).toBeGreaterThan(parsed);
  });

  it('RF-1011 shows the messages a call adds to a transcript that is still being written', async () => {
    await appendTranscript(1, 'task-1', [{ seq: 1, callId: 'c#1' }]);
    const { reader } = setup();
    await reader.transcript(scopeOf(1), 'task-1');

    await appendTranscript(1, 'task-1', [{ seq: 2, callId: 'c#2' }]);

    const grown = await reader.transcript(scopeOf(1), 'task-1');
    expect(grown.map((entry) => entry.seq)).toEqual([1, 2]);
  });
});
