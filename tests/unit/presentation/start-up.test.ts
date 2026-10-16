import { describe, expect, it } from 'vitest';
import { startUp } from '../../../src/presentation/start-up.js';

// RF-1302, DEC-140: the schema check (the migrate step ran before the server) comes before the
// server accepts requests; the scheduler starts after.
// RF-1102: the bootstrap administrator is created after the migrations and before the server
// listens (architecture section 4, main.ts). RF-1108, RNF-002: runs left running by the earlier
// process end as interrupted before the server listens. RF-1104, DEC-112: provider keys sealed
// under ROSETTA_SECRET_KEY_PREVIOUS are re-encrypted right after the migrations.

type Step =
  | 'checkSchema'
  | 'reEncryptKeys'
  | 'bootstrapAdmin'
  | 'discardPartialSnapshots'
  | 'recoverRuns'
  | 'listen';

function recordingSteps(failAt?: Step): {
  readonly calls: string[];
  readonly steps: Parameters<typeof startUp>[0];
} {
  const calls: string[] = [];
  const step = (name: Step) => (): Promise<void> => {
    calls.push(name);
    return name === failAt ? Promise.reject(new Error(`${name} failed`)) : Promise.resolve();
  };
  return {
    calls,
    steps: {
      checkSchema: step('checkSchema'),
      reEncryptKeys: step('reEncryptKeys'),
      bootstrapAdmin: step('bootstrapAdmin'),
      discardPartialSnapshots: step('discardPartialSnapshots'),
      recoverRuns: step('recoverRuns'),
      listen: step('listen'),
      startScheduler: () => {
        calls.push('startScheduler');
      },
    },
  };
}

describe('start-up', () => {
  it('RF-1302 RF-1104 RF-1102 RF-1108 checks the schema, re-encrypts keys, creates the bootstrap admin, discards partial snapshots, recovers runs, listens, then starts the scheduler', async () => {
    const { calls, steps } = recordingSteps();

    await startUp(steps);

    expect(calls).toEqual([
      'checkSchema',
      'reEncryptKeys',
      'bootstrapAdmin',
      'discardPartialSnapshots',
      'recoverRuns',
      'listen',
      'startScheduler',
    ]);
  });

  it('RF-1104 a failing key re-encryption stops the start-up before the server listens', async () => {
    const { calls, steps } = recordingSteps('reEncryptKeys');

    await expect(startUp(steps)).rejects.toThrow('reEncryptKeys failed');

    expect(calls).toEqual(['checkSchema', 'reEncryptKeys']);
  });
});

describe('start-up failures', () => {
  it('RF-1102 a refused bootstrap administrator stops the start-up before the server listens', async () => {
    const { calls, steps } = recordingSteps('bootstrapAdmin');

    await expect(startUp(steps)).rejects.toThrow('bootstrapAdmin failed');

    expect(calls).toEqual(['checkSchema', 'reEncryptKeys', 'bootstrapAdmin']);
  });

  it('RF-1302 a schema the migrate step has not brought up to date stops the start-up before the server listens', async () => {
    const { calls, steps } = recordingSteps('checkSchema');

    await expect(startUp(steps)).rejects.toThrow('checkSchema failed');

    expect(calls).toEqual(['checkSchema']);
  });

  it('RF-1302 the scheduler does not start when the server cannot listen', async () => {
    const { calls, steps } = recordingSteps('listen');

    await expect(startUp(steps)).rejects.toThrow('listen failed');

    expect(calls).toEqual([
      'checkSchema',
      'reEncryptKeys',
      'bootstrapAdmin',
      'discardPartialSnapshots',
      'recoverRuns',
      'listen',
    ]);
  });

  it('RNF-002 a failing run recovery stops the start-up before the server listens', async () => {
    const { calls, steps } = recordingSteps('recoverRuns');

    await expect(startUp(steps)).rejects.toThrow('recoverRuns failed');

    expect(calls).toEqual([
      'checkSchema',
      'reEncryptKeys',
      'bootstrapAdmin',
      'discardPartialSnapshots',
      'recoverRuns',
    ]);
  });
});
