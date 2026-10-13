import { describe, expect, it } from 'vitest';
import type { RunCallReader, StoredCall } from '../../../../src/application/ports/run-call-reader.js';
import {
  ListRunCalls,
  MAX_LISTED_CALLS,
} from '../../../../src/application/use-cases/list-run-calls.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { sampleRecord } from '../../../contracts/provider-call-recorder.contract.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-1011, RF-1105: the panel lists at most the newest MAX_LISTED_CALLS attempts, but its summary
// counts every attempt, and only the owner of the run reads it.

function attempts(count: number): StoredCall[] {
  return Array.from({ length: count }, (_item, index) => ({
    ...sampleRecord,
    seq: index + 1,
    callId: `${sampleRecord.runId}#${String(index + 1)}`,
  }));
}

function readerOf(calls: readonly StoredCall[]): RunCallReader {
  return { calls: () => Promise.resolve(calls), transcript: () => Promise.resolve([]) };
}

async function setup(calls: readonly StoredCall[]) {
  const runs = new MemoryRunIndex();
  const run = sampleRun({ userId: 'user-amy' });
  await runs.insert(run);
  const useCase = new ListRunCalls({
    runs,
    calls: readerOf(calls),
    manifests: new MemoryRunManifestStore(),
  });
  const actor: Actor = { userId: 'user-amy', role: 'user' };
  return { useCase, run, actor };
}

describe('ListRunCalls', () => {
  it('RF-1011 lists the newest attempts only past the limit and still summarizes all of them', async () => {
    const { useCase, run, actor } = await setup(attempts(MAX_LISTED_CALLS + 5));

    const outcome = await useCase.execute({ actor, runId: run.id });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.total).toBe(MAX_LISTED_CALLS + 5);
    expect(outcome.value.calls).toHaveLength(MAX_LISTED_CALLS);
    expect(outcome.value.calls[0]?.seq).toBe(6);
    expect(outcome.value.calls.at(-1)?.seq).toBe(MAX_LISTED_CALLS + 5);
    expect(outcome.value.summary[0]?.calls).toBe(MAX_LISTED_CALLS + 5);
  });

  it("RF-1105 answers not-found for another user's run", async () => {
    const { useCase, run } = await setup(attempts(1));

    const outcome = await useCase.execute({
      actor: { userId: 'user-bob', role: 'user' },
      runId: run.id,
    });

    expect(outcome).toEqual({ ok: false, error: 'not-found' });
  });
});
