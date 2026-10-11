import { describe, expect, it } from 'vitest';
import { startUp } from '../../../src/presentation/start-up.js';

// RF-1302: migrations are applied before the server accepts requests; the scheduler starts after.

function recordingSteps(failAt?: 'migrate' | 'listen'): {
  readonly calls: string[];
  readonly steps: Parameters<typeof startUp>[0];
} {
  const calls: string[] = [];
  const step = (name: 'migrate' | 'listen') => (): Promise<void> => {
    calls.push(name);
    return name === failAt ? Promise.reject(new Error(`${name} failed`)) : Promise.resolve();
  };
  return {
    calls,
    steps: {
      migrate: step('migrate'),
      listen: step('listen'),
      startScheduler: () => {
        calls.push('startScheduler');
      },
    },
  };
}

describe('start-up', () => {
  it('RF-1302 applies the migrations, then listens, then starts the scheduler', async () => {
    const { calls, steps } = recordingSteps();

    await startUp(steps);

    expect(calls).toEqual(['migrate', 'listen', 'startScheduler']);
  });

  it('RF-1302 a failing migration stops the start-up before the server listens', async () => {
    const { calls, steps } = recordingSteps('migrate');

    await expect(startUp(steps)).rejects.toThrow('migrate failed');

    expect(calls).toEqual(['migrate']);
  });

  it('RF-1302 the scheduler does not start when the server cannot listen', async () => {
    const { calls, steps } = recordingSteps('listen');

    await expect(startUp(steps)).rejects.toThrow('listen failed');

    expect(calls).toEqual(['migrate', 'listen']);
  });
});
