import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { PlannerCall } from '../../../../src/application/plan/ask-planner.js';
import { planDataModel } from '../../../../src/application/plan/plan-data-model.js';
import type { LlmProvider, LlmRequest } from '../../../../src/application/ports/llm-provider.js';
import { ManifestUpdates } from '../../../../src/application/runs/manifest-updates.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { briefOf } from '../../../support/data-model-sqlserver-orders.js';
import { staffCards } from '../../../support/data-model-column-facts.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// P5-37, RF-623: planDataModel keeps the types, nullability and defaults of the ENT claims against a
// recorded wrong planner answer, and lists what changed.

const window = { windowTokens: 32_768, maxOutputTokens: 4_096 };

function setup(text: string): { call: PlannerCall; requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  const provider: LlmProvider = {
    complete(request) {
      requests.push(request);
      const usage = { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 } as const;
      return Promise.resolve(
        fakeResponse({
          ...{ text: text, toolCalls: [], finishReason: 'stop' },
          usage: { ...usage, usageSource: 'reported' },
        }),
      );
    },
  };
  let count = 0;
  const run = sampleRun({ stage: 'plan' });
  const call: PlannerCall = {
    run,
    planner: {
      ...{ provider, name: 'fake', kind: 'fake', model: 'm', maxOutputTokens: 4_096 },
      keySource: 'user',
    },
    prompt: { name: 'planner/data-model.v3.md', version: 'v3', sha256: 'b'.repeat(64), text: 'x' },
    continuePrompt: {
      name: 'planner/continue.v1.md',
      version: 'v1',
      sha256: 'a'.repeat(64),
      text: 'go',
    },
    agentTaskId: 'planner-data-model',
    updates: new ManifestUpdates(new MemoryRunManifestStore(), scopeFor()),
    tags: () => {
      count += 1;
      return `${'a'.repeat(23)}${'abcdefgh'[count % 8] ?? 'A'}`;
    },
    callId: () => `${run.runKey}#${String(count)}`,
    signal: new AbortController().signal,
    window,
  };
  return { call, requests };
}

describe('planDataModel: column facts', () => {
  it('RF-623 keeps the float, NOT NULL and the default of the legacy claims, and lists the changes', async () => {
    const answer = await readFile(
      'tests/fixtures/planner/data-model-clinic-staff-wrong.json',
      'utf8',
    );
    const { call } = setup(answer);

    const planned = await planDataModel(call, {
      cards: staffCards(),
      brief: briefOf('PostgreSQL'),
    });

    const columns = planned.assembly.model.tables[0]?.columns ?? [];
    const named = (name: string) => columns.find((each) => each.name === name);
    expect(named('rating')).toMatchObject({ type: 'float', nullable: false });
    expect(named('patients_treated')).toMatchObject({ nullable: false, default: '0' });
    expect(planned.problems.map((each) => each.item)).toEqual(
      expect.arrayContaining(['salary', 'address']),
    );
    expect(planned.flagged).toBeGreaterThanOrEqual(2);
  });
});
