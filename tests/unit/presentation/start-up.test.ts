import { describe, expect, it } from 'vitest';
import { startUp } from '../../../src/presentation/start-up.js';

// RF-1302: migrations are applied before the server accepts requests; the scheduler starts after.
// RF-1102: the bootstrap administrator is created after the migrations and before the server
// listens (architecture section 4, main.ts). RF-1108, RNF-002: runs left running by the earlier
// process end as interrupted before the server listens.

type Step = 'migrate' | 'bootstrapAdmin' | 'recoverRuns' | 'listen';

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
      migrate: step('migrate'),
      bootstrapAdmin: step('bootstrapAdmin'),
      recoverRuns: step('recoverRuns'),
      listen: step('listen'),
      startScheduler: () => {
        calls.push('startScheduler');
      },
    },
  };
}

describe('start-up', () => {
  it('RF-1302 RF-1102 RF-1108 migrates, creates the bootstrap admin, recovers runs, listens, then starts the scheduler', async () => {
    const { calls, steps } = recordingSteps();

    await startUp(steps);

    expect(calls).toEqual(['migrate', 'bootstrapAdmin', 'recoverRuns', 'listen', 'startScheduler']);
  });

  it('RF-1102 a refused bootstrap administrator stops the start-up before the server listens', async () => {
    const { calls, steps } = recordingSteps('bootstrapAdmin');

    await expect(startUp(steps)).rejects.toThrow('bootstrapAdmin failed');

    expect(calls).toEqual(['migrate', 'bootstrapAdmin']);
  });

  it('RF-1302 a failing migration stops the start-up before the server listens', async () => {
    const { calls, steps } = recordingSteps('migrate');

    await expect(startUp(steps)).rejects.toThrow('migrate failed');

    expect(calls).toEqual(['migrate']);
  });

  it('RF-1302 the scheduler does not start when the server cannot listen', async () => {
    const { calls, steps } = recordingSteps('listen');

    await expect(startUp(steps)).rejects.toThrow('listen failed');

    expect(calls).toEqual(['migrate', 'bootstrapAdmin', 'recoverRuns', 'listen']);
  });

  it('RNF-002 a failing run recovery stops the start-up before the server listens', async () => {
    const { calls, steps } = recordingSteps('recoverRuns');

    await expect(startUp(steps)).rejects.toThrow('recoverRuns failed');

    expect(calls).toEqual(['migrate', 'bootstrapAdmin', 'recoverRuns']);
  });
});
