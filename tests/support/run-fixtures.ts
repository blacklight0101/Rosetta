import type { RunManifest } from '../../src/domain/runs/run-manifest.js';
import type { Run } from '../../src/domain/runs/run.js';
import { fixtureNow } from './account-fixtures.js';

// RF-003, RF-1108: valid runs of tests. A test overrides what it needs.

let runCount = 0;

const noTotals = {
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

/** A manifest of a run that has been accepted and is not over; a test overrides what it needs. */
export function sampleManifest(overrides: Partial<RunManifest> = {}): RunManifest {
  return {
    schemaVersion: 1,
    runId: '20261012-100000-scan',
    stage: 'scan',
    rosettaVersion: '1.2.3-test',
    startedAt: null,
    endedAt: null,
    endState: null,
    resumedFrom: null,
    source: {
      url: 'https://github.com/owner/repo',
      owner: 'owner',
      repo: 'repo',
      ref: '',
      commitSha: null,
      subpath: '',
      snapshotHash: null,
    },
    codemapHash: null,
    options: {},
    roles: {
      reader: {
        provider: 'ollama',
        kind: 'ollama',
        model: 'model-a',
        modelVersion: null,
        modelDigest: null,
        toolMode: 'native',
        maxOutputTokens: 4096,
        temperature: null,
        maxTurns: 12,
      },
    },
    promptVersions: {},
    security: {
      deniedReads: 0,
      refusedRequests: 0,
      skippedLinks: 0,
      blockedCalls: 0,
      allowDenied: [],
    },
    priceTable: null,
    caps: { run: { maxCostMicros: 500_000, maxTokens: 2_000_000 }, roles: {} },
    masking: {},
    totals: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costMicros: 0, calls: 0 },
    agentTasks: [],
    ...overrides,
  };
}
