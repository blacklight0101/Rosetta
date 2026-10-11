import { readdir, readFile } from 'node:fs/promises';
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

describe('JsonlProviderCallLog on a resumed run (RF-006)', () => {
  const tmp = useTempRoot('rosetta-resume-');
  const entry = { at: sampleRecord.startedAt, callId: sampleRecord.callId, role: 'user' as const };

  function seqsOf(text: string): unknown[] {
    return text
      .trimEnd()
      .split('\n')
      .map((line): unknown => {
        const parsed: unknown = JSON.parse(line);
        return parsed instanceof Object && 'seq' in parsed ? parsed.seq : undefined;
      });
  }

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
