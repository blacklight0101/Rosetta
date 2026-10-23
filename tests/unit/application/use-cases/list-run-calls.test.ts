import { describe, expect, it } from 'vitest';
import type {
  RunCallLog,
  RunCallReader,
  StoredCall,
} from '../../../../src/application/ports/run-call-reader.js';
import {
  DEFAULT_CALLS_PAGE,
  ListRunCalls,
  MAX_CALLS_PAGE,
} from '../../../../src/application/use-cases/list-run-calls.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import { summarizeCalls } from '../../../../src/domain/observability/call-stats.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { sampleRecord } from '../../../contracts/provider-call-recorder.contract.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-1011, RF-1105 (P5-22): the panel lists a page of attempts after a cursor, its summary counts
// every attempt, and only the owner of the run reads it.

function attempts(count: number): StoredCall[] {
  return Array.from({ length: count }, (_item, index) => ({
    ...sampleRecord,
    seq: index + 1,
    callId: `${sampleRecord.runId}#${String(index + 1)}`,
  }));
}

function logOf(calls: readonly StoredCall[]): RunCallLog {
  return {
    calls,
    summary: summarizeCalls(calls),
    find: (seq) => calls.find((call) => call.seq === seq),
    page: (after, limit) => calls.filter((call) => call.seq > after).slice(0, limit),
  };
}

function readerOf(calls: readonly StoredCall[]): RunCallReader {
  return {
    log: () => Promise.resolve(logOf(calls)),
    calls: () => Promise.resolve(calls),
    transcript: () => Promise.resolve([]),
  };
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
  it('RF-1011 lists one page with a cursor and still summarizes every attempt', async () => {
    const { useCase, run, actor } = await setup(attempts(120));

    const outcome = await useCase.execute({ actor, runId: run.id, limit: 50 });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.total).toBe(120);
    expect(outcome.value.calls.map((call) => call.seq)).toEqual(
      Array.from({ length: 50 }, (_item, index) => index + 1),
    );
    expect(outcome.value.nextCursor).toBe('50');
    expect(outcome.value.summary[0]?.calls).toBe(120);
  });

  it('RF-1011 continues after the cursor and gives no cursor on the last page', async () => {
    const { useCase, run, actor } = await setup(attempts(120));

    const outcome = await useCase.execute({ actor, runId: run.id, limit: 50, after: 100 });

    expect(outcome.ok && outcome.value.calls.map((call) => call.seq)).toEqual(
      Array.from({ length: 20 }, (_item, index) => index + 101),
    );
    expect(outcome.ok && outcome.value.nextCursor).toBeUndefined();
  });

  it('RF-1011 pages by the default size and never more than the largest page', async () => {
    const { useCase, run, actor } = await setup(attempts(MAX_CALLS_PAGE + 50));

    const normal = await useCase.execute({ actor, runId: run.id });
    const huge = await useCase.execute({ actor, runId: run.id, limit: MAX_CALLS_PAGE * 10 });

    expect(normal.ok && normal.value.calls).toHaveLength(DEFAULT_CALLS_PAGE);
    expect(huge.ok && huge.value.calls).toHaveLength(MAX_CALLS_PAGE);
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
