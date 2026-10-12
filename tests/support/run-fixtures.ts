import type { Run } from '../../src/domain/runs/run.js';
import { fixtureNow } from './account-fixtures.js';

// RF-003, RF-1108: valid runs of tests. A test overrides what it needs.

let runCount = 0;

export const noTotals = {
  costMicros: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
} as const;

/** A queued scan run with generated ids; `queuedAt` grows with every run so the order is stable. */
export function sampleRun(overrides: Partial<Run> = {}): Run {
  runCount += 1;
  const number = String(runCount).padStart(12, '0');
  return {
    id: `00000000-0000-4000-b000-${number}`,
    projectId: '00000000-0000-4000-a000-000000000001',
    userId: '00000000-0000-4000-9000-000000000001',
    runKey: `20261012-100000-scan${runCount === 1 ? '' : `-${String(runCount)}`}`,
    stage: 'scan',
    commitSha: null,
    snapshotKey: null,
    queueState: 'Queued',
    endState: null,
    queuedAt: fixtureNow + runCount * 1000,
    startedAt: null,
    endedAt: null,
    totals: noTotals,
    ...overrides,
  };
}

/** A run that is running for the given user. */
export function runningRun(overrides: Partial<Run> = {}): Run {
  return sampleRun({ queueState: 'Running', startedAt: fixtureNow + 500, ...overrides });
}
