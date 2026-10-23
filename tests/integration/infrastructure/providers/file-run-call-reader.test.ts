import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FileRunCallReader } from '../../../../src/infrastructure/providers/file-run-call-reader.js';
import { JsonlProviderCallLog } from '../../../../src/infrastructure/providers/jsonl-provider-call-log.js';
import { sampleRecord } from '../../../contracts/provider-call-recorder.contract.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1011, RF-408, RNF-003, RF-1105: the "API calls" panel reads the provider call log and the
// transcripts back from the run folder, scoped to the owner's workspace, masked once more, and
// without a record that does not parse.

const root = useTempRoot('rosetta-call-reader-');

const amy = '00000000-0000-4000-9000-0000000000a1';
const bob = '00000000-0000-4000-9000-0000000000b2';
const projectId = '00000000-0000-4000-a000-0000000000a1';
const runKey = '20261011-090503-understand';
const scopeOf = (userId: string): RunScope => ({
  id: '00000000-0000-4000-b000-000000000001',
  userId,
  projectId,
  runKey,
});

const runDirOf = (userId: string): string =>
  join(root.path, 'users', userId, 'projects', projectId, 'runs', runKey);

function readerOf(): FileRunCallReader {
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), masker);
  return new FileRunCallReader({
    reader: new NodeOutputWriter({ dataDir: root.path, logger }),
    masker,
  });
}

function recorderOf(userId: string): JsonlProviderCallLog {
  return new JsonlProviderCallLog({ runDir: runDirOf(userId), masker: new SecretMasker() });
}

describe('FileRunCallReader calls', () => {
  it('RF-1011 reads back the attempts the call log wrote, with their seq', async () => {
    const recorder = recorderOf(amy);
    await recorder.record(sampleRecord);
    await recorder.record({ ...sampleRecord, callId: `${runKey}#2`, attempt: 1, status: 'failed' });

    const calls = (await readerOf().log(scopeOf(amy))).calls;

    expect(calls.map((call) => [call.seq, call.callId, call.status])).toEqual([
      [1, sampleRecord.callId, 'ok'],
      [2, `${runKey}#2`, 'failed'],
    ]);
    expect(calls[0]).toMatchObject({
      provider: 'local',
      kind: 'ollama',
      model: 'qwen2.5-coder:7b',
      latencyMs: 1500,
      timeToFirstTokenMs: 420,
      ollama: { tokensPerSecond: 42 },
      transcriptRef: 'transcripts/task-1.jsonl#1',
    });
  });

  it('RF-408 reads back the tokens a call wrote to the prompt cache, and none when it wrote none', async () => {
    const recorder = recorderOf(amy);
    await recorder.record({ ...sampleRecord, cacheWriteInputTokens: 300 });
    await recorder.record({ ...sampleRecord, callId: `${runKey}#2` });

    const calls = (await readerOf().log(scopeOf(amy))).calls;

    expect(calls[0]?.cacheWriteInputTokens).toBe(300);
    expect(calls[1]).not.toHaveProperty('cacheWriteInputTokens');
  });

  it('RF-1011 gives no attempts for a run without a call log', async () => {
    expect((await readerOf().log(scopeOf(amy))).calls).toEqual([]);
  });

  it("RF-1105 reads only the owner's workspace: the same run folder under another user is empty", async () => {
    await recorderOf(amy).record(sampleRecord);

    expect((await readerOf().log(scopeOf(bob))).calls).toEqual([]);
    expect((await readerOf().log(scopeOf(amy))).calls).toHaveLength(1);
  });
});

describe('FileRunCallReader damaged lines', () => {
  it('RF-1011 leaves out a torn last line and a line that is not a record', async () => {
    await recorderOf(amy).record(sampleRecord);
    const file = join(runDirOf(amy), 'provider-calls.jsonl');
    const torn = '{"schemaVersion":1,"seq":10,"x';
    await appendFile(file, `not json\n{"schemaVersion":1,"seq":9}\n${torn}`, 'utf8');

    const calls = (await readerOf().log(scopeOf(amy))).calls;

    expect(calls.map((call) => call.seq)).toEqual([1]);
  });

  it('RNF-003 masks a secret that is in the file when it is read', async () => {
    await mkdir(runDirOf(amy), { recursive: true });
    const record = { schemaVersion: 1, seq: 1, ...sampleRecord, model: fakeOpenAiKey };
    await appendFile(
      join(runDirOf(amy), 'provider-calls.jsonl'),
      `${JSON.stringify(record)}\n`,
      'utf8',
    );

    const calls = (await readerOf().log(scopeOf(amy))).calls;

    expect(JSON.stringify(calls)).not.toContain(fakeOpenAiKey);
    expect(calls[0]?.model).toContain('[MASKED:');
  });
});

describe('FileRunCallReader transcript', () => {
  it('RF-1011 reads back the messages of an agent task in order with their call ids', async () => {
    const recorder = recorderOf(amy);
    const { startedAt, callId } = sampleRecord;
    await recorder.transcript('task-1', [
      { at: startedAt, callId, role: 'system', content: 'Rules.' },
      { at: startedAt, callId, role: 'user', content: 'Read it.' },
    ]);
    await recorder.transcript('task-1', [
      {
        at: startedAt,
        callId: `${runKey}#2`,
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'read_file', arguments: { path: 'a.cs' } }],
      },
    ]);

    const entries = await readerOf().transcript(scopeOf(amy), 'task-1');

    expect(entries.map((entry) => [entry.seq, entry.callId, entry.role])).toEqual([
      [1, callId, 'system'],
      [2, callId, 'user'],
      [3, `${runKey}#2`, 'assistant'],
    ]);
    expect(entries[2]?.toolCalls).toEqual([
      { id: 'tc-1', name: 'read_file', arguments: { path: 'a.cs' } },
    ]);
  });
});

describe('FileRunCallReader transcript files', () => {
  it('RF-1011 gives no messages for a task without a transcript and for a name that is not a plain file name', async () => {
    await recorderOf(amy).record(sampleRecord);

    expect(await readerOf().transcript(scopeOf(amy), 'task-9')).toEqual([]);
    expect(await readerOf().transcript(scopeOf(amy), '../provider-calls')).toEqual([]);
  });

  it('RNF-003 masks a secret that is in a transcript file when it is read', async () => {
    await mkdir(join(runDirOf(amy), 'transcripts'), { recursive: true });
    const line = JSON.stringify({
      schemaVersion: 1,
      seq: 1,
      at: sampleRecord.startedAt,
      callId: sampleRecord.callId,
      role: 'user',
      content: `The key is ${fakeOpenAiKey}.`,
    });
    await appendFile(join(runDirOf(amy), 'transcripts', 'task-1.jsonl'), `${line}\n`, 'utf8');

    const entries = await readerOf().transcript(scopeOf(amy), 'task-1');

    expect(JSON.stringify(entries)).not.toContain(fakeOpenAiKey);
    expect(entries[0]?.content).toContain('[MASKED:');
  });
});

describe('FileRunCallReader error text', () => {
  it('RF-408 reads back the provider error text of a failed attempt, and none for an answered one', async () => {
    const recorder = recorderOf(amy);
    await recorder.record({ ...sampleRecord, status: 'failed', errorMessage: 'bad_request: no' });
    await recorder.record({ ...sampleRecord, callId: `${runKey}#2` });

    const calls = await readerOf().calls(scopeOf(amy));

    expect(calls[0]?.errorMessage).toBe('bad_request: no');
    expect(calls[1]).not.toHaveProperty('errorMessage');
  });
});
