import { describe, expect, it } from 'vitest';
import { overviewStep } from '../../../../src/application/understand/overview-step.js';
import { RunCoverage } from '../../../../src/application/understand/run-coverage.js';
import { ManifestUpdates } from '../../../../src/application/runs/manifest-updates.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { goodOverviewAnswer, overviewCards } from '../../../support/app-overview-fixtures.js';
import { answer, Answers } from '../../../support/overview-step-harness.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-264, P7-26: a run stopped by a cap (not by the user) still asks for its overview.

function run(signal: AbortSignal, provider: Answers) {
  const parts = {
    ...{ logger: new RecordingLogger(), ids: new SequenceIdGenerator() },
    ...{ traceId: 'a'.repeat(32), nextCallId: () => 'c#1' },
    summariser: {
      ...{ provider, name: 'fake', kind: 'fake' as const },
      ...{ model: 'm', maxOutputTokens: 900, keySource: 'user' as const },
    },
    updates: new ManifestUpdates(new MemoryRunManifestStore(), scopeFor()),
    execution: { run: sampleRun({ stage: 'understand' }), signal },
    overviewPrompt: { name: 'summariser/overview.v1.md', version: 'v1', sha256: 'ab', text: 'x' },
    scanned: {
      codeMap: { areas: [], files: [], symbols: [] },
      source: { snapshotKey: 'upload__x@aaaaaaaaaaaaaaaa' },
    },
    allTasks: [],
  } as const;
  return overviewStep(parts, overviewCards(), {
    coverage: new RunCoverage([]),
    thirdParty: new Set(),
  });
}

describe('overviewStep after a stop', () => {
  it('RF-264 writes the overview after a run stopped by a cap', async () => {
    const stopped = new AbortController();
    stopped.abort(new RosettaError(ERROR_CODES.budgetCapReached));
    const provider = new Answers(() => answer(goodOverviewAnswer));

    const overview = await run(stopped.signal, provider);

    expect(provider.requests).toHaveLength(1);
    expect(overview.state).toBe('full');
  });

  it('RF-264 writes no overview after the owner pressed Stop', async () => {
    const stopped = new AbortController();
    stopped.abort();
    const provider = new Answers(() => answer(goodOverviewAnswer));

    const overview = await run(stopped.signal, provider);

    expect(provider.requests).toHaveLength(0);
    expect(overview.state).toBe('unavailable');
  });
});
