import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { NodeWorkspaceFolders } from '../../../../src/infrastructure/files/node-workspace-folders.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { projectCallSinks } from '../../../../src/infrastructure/providers/project-call-sinks.js';
import { sampleRecord } from '../../../contracts/provider-call-recorder.contract.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-142, RF-408, RF-141, RF-005: a model call of a project that belongs to no run (the options of
// Plan setup) keeps its egress line, provider-call record and masking counts in the project's own
// folder of the owner's workspace, masked like the logs of a run, and the folder goes with the project.

const data = useTempRoot('rosetta-call-sinks-');
const target = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000a1',
};
const folder = (): string =>
  join(data.path, 'users', target.userId, 'projects', target.projectId, 'plan-options');
const awsKey = ['AKIA', 'QYLPMN5HHHFPZAM2'].join('');

function sinks() {
  const masker = new SecretMasker();
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const writer = new NodeOutputWriter({
    dataDir: data.path,
    logger: new MemoryLogger(clock, masker),
  });
  return projectCallSinks({ writer, masker, clock, dataDir: data.path })(target);
}

const lines = async (name: string): Promise<Record<string, unknown>[]> => {
  const text = await readFile(join(folder(), name), 'utf8');
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line): Record<string, unknown> => JSON.parse(line) as Record<string, unknown>);
};

describe('projectCallSinks', () => {
  it('RF-142 writes an egress line with the masking counts into the folder of the project', async () => {
    await sinks().egressLog.append({
      ...{ at: '2026-10-12T10:00:00.000Z', callId: 'plan-options-1#1', provider: 'openai' },
      ...{ model: 'gpt', role: 'planner', agentTaskId: 'planner-options', excerpts: [] },
      maskedCounts: { 'api-key': 2 },
    });

    const written = await lines('egress.log.jsonl');

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ seq: 1, role: 'planner', maskedCounts: { 'api-key': 2 } });
  });

  it('RF-408 RF-141 writes the provider-call record masked, and a secret in it never reaches the file', async () => {
    await sinks().recorder.record({ ...sampleRecord, requestId: `req ${awsKey}` });

    const text = await readFile(join(folder(), 'provider-calls.jsonl'), 'utf8');

    expect(text.split('\n').filter((line) => line !== '')).toHaveLength(1);
    expect(text).not.toContain(awsKey);
    expect(text).toContain('[MASKED');
  });

  it('RF-141 keeps the secrets masked and the calls blocked in a security log of the project', async () => {
    const { security } = sinks();

    await security.addMasking({ 'api-key': 1 });
    await security.addBlockedCall();

    const written = await lines('security.log.jsonl');
    expect(written.map((line) => line['kind'])).toEqual(['masking', 'blocked']);
    expect(written[0]).toMatchObject({ counts: { 'api-key': 1 } });
  });

  it('RF-1105 keeps the logs inside the owner folder, readable by no one else', async () => {
    await sinks().security.addBlockedCall();

    expect((await stat(folder())).isDirectory()).toBe(true);
    expect(folder().startsWith(join(data.path, 'users', target.userId))).toBe(true);
  });

  it('RF-005 removes the logs with the project', async () => {
    await sinks().security.addBlockedCall();

    await new NodeWorkspaceFolders(data.path).remove(target);

    await expect(stat(folder())).rejects.toThrow();
  });
});
