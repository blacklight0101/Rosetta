import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { JsonlProviderCallLog } from '../../../../src/infrastructure/providers/jsonl-provider-call-log.js';
import {
  providerCallRecorderContract,
  sampleRecord,
} from '../../../contracts/provider-call-recorder.contract.js';
import { useTempRoot } from '../../../support/temp-root.js';

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  }
}

describe('JsonlProviderCallLog', () => {
  const tmp = useTempRoot('rosetta-calls-');

  providerCallRecorderContract('JsonlProviderCallLog', (masker) => {
    const runDir = join(tmp.path, 'run');
    return Promise.resolve({
      recorder: new JsonlProviderCallLog({ runDir, masker }),
      calls: () => readOrEmpty(join(runDir, 'provider-calls.jsonl')),
      transcript: (agentTaskId) => readOrEmpty(join(runDir, 'transcripts', `${agentTaskId}.jsonl`)),
    });
  });

  it('RF-408 writes provider-calls.jsonl and the transcripts inside the run folder', async () => {
    const log = new JsonlProviderCallLog({ runDir: tmp.path, masker: new SecretMasker() });
    await log.record(sampleRecord);
    await log.transcript('task-1', [
      { at: sampleRecord.startedAt, callId: sampleRecord.callId, role: 'user', content: 'Hi.' },
    ]);

    expect((await readdir(tmp.path)).sort()).toEqual(['provider-calls.jsonl', 'transcripts']);
    expect(await readdir(join(tmp.path, 'transcripts'))).toEqual(['task-1.jsonl']);
  });

  it('RF-408 keeps the seq order when attempts are recorded at the same time', async () => {
    const log = new JsonlProviderCallLog({ runDir: tmp.path, masker: new SecretMasker() });

    await Promise.all([1, 2, 3, 4, 5].map((attempt) => log.record({ ...sampleRecord, attempt })));

    const text = await readFile(join(tmp.path, 'provider-calls.jsonl'), 'utf8');
    const lines = text
      .trimEnd()
      .split('\n')
      .map((line): unknown => JSON.parse(line));
    expect(lines.map((line) => (line instanceof Object && 'seq' in line ? line.seq : 0))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });
});

function seqsOf(text: string): unknown[] {
  return text
    .trimEnd()
    .split('\n')
    .map((line): unknown => {
      const parsed: unknown = JSON.parse(line);
      return parsed instanceof Object && 'seq' in parsed ? parsed.seq : undefined;
    });
}

describe('JsonlProviderCallLog on a resumed run (RF-006)', () => {
  const tmp = useTempRoot('rosetta-resume-');
  const entry = { at: sampleRecord.startedAt, callId: sampleRecord.callId, role: 'user' as const };

  it('RF-408 continues seq and transcript lines after the lines a previous log wrote', async () => {
    const first = new JsonlProviderCallLog({ runDir: tmp.path, masker: new SecretMasker() });
    await first.record(sampleRecord);
    await first.transcript('task-1', [
      { ...entry, content: 'one' },
      { ...entry, content: 'two' },
    ]);
    const second = new JsonlProviderCallLog({ runDir: tmp.path, masker: new SecretMasker() });

    await second.record({ ...sampleRecord, attempt: 2 });
    const ref = await second.transcript('task-1', [{ ...entry, content: 'three' }]);

    expect(ref).toBe('transcripts/task-1.jsonl#3');
    expect(seqsOf(await readFile(join(tmp.path, 'provider-calls.jsonl'), 'utf8'))).toEqual([1, 2]);
    const transcript = await readFile(join(tmp.path, 'transcripts', 'task-1.jsonl'), 'utf8');
    expect(seqsOf(transcript)).toEqual([1, 2, 3]);
  });
});

describe('JsonlProviderCallLog after a crash mid-append (RF-006)', () => {
  const tmp = useTempRoot('rosetta-torn-');
  const entry = { at: sampleRecord.startedAt, callId: sampleRecord.callId, role: 'user' as const };

  it('RF-006 starts a new line after a torn last line and counts it, so seq never repeats', async () => {
    const first = new JsonlProviderCallLog({ runDir: tmp.path, masker: new SecretMasker() });
    await first.record(sampleRecord);
    const calls = join(tmp.path, 'provider-calls.jsonl');
    await appendFile(calls, '{"schemaVersion":1,"seq":2,"tra', 'utf8');
    const second = new JsonlProviderCallLog({ runDir: tmp.path, masker: new SecretMasker() });

    await second.record({ ...sampleRecord, attempt: 2 });

    const lines = (await readFile(calls, 'utf8')).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('{"schemaVersion":1,"seq":2,"tra');
    expect(lines[3]).toBe('');
    expect(seqsOf([lines[0], lines[2]].join('\n'))).toEqual([1, 3]);
  });

  it('RF-006 continues a transcript whose last line was torn', async () => {
    const dir = join(tmp.path, 'transcripts');
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'task-1.jsonl'), '{"schemaVersion":1,"seq":1,"at":"20', 'utf8');
    const log = new JsonlProviderCallLog({ runDir: tmp.path, masker: new SecretMasker() });

    const ref = await log.transcript('task-1', [{ ...entry, content: 'next' }]);

    const lines = (await readFile(join(dir, 'task-1.jsonl'), 'utf8')).split('\n');
    expect(ref).toBe('transcripts/task-1.jsonl#2');
    expect(lines).toHaveLength(3);
    expect(seqsOf(lines[1] ?? '')).toEqual([2]);
  });
});
