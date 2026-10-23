import { describe, expect, it } from 'vitest';
import type { PlannerCall } from '../../../../src/application/plan/ask-planner.js';
import { planDataModel } from '../../../../src/application/plan/plan-data-model.js';
import { promptBudgetTokens } from '../../../../src/application/plan/plan-packing.js';
import type { LlmProvider, LlmRequest } from '../../../../src/application/ports/llm-provider.js';
import { ManifestUpdates } from '../../../../src/application/runs/manifest-updates.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { briefOf, card } from '../../../support/data-model-sqlserver-orders.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// P3-120, P3-113: planDataModel packs the rule cards with the entity cards. At a small window the
// request fits the budget and the rule cards left out are named by id.

const window = { windowTokens: 32_768, maxOutputTokens: 4_096 };

function setup(): { call: PlannerCall; requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  const provider: LlmProvider = {
    complete(request) {
      requests.push(request);
      const usage = { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 } as const;
      return Promise.resolve(
        fakeResponse({
          ...{ text: '{"tables": []}', toolCalls: [], finishReason: 'stop' },
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

describe('planDataModel: the rule cards are packed', () => {
  it('EV-29 keeps the request inside the window and names the rule cards left out', async () => {
    const { call, requests } = setup();
    const entity = card('ENT-001', 'ENT', 'Orders', ['tblOrders(status_id int) holds orders.']);
    const rules = Array.from({ length: 300 }, (_unused, at) =>
      card(`BR-${String(at).padStart(3, '0')}`, 'BR', 'Rule', [
        `When \`status_id\` is ${String(at)} the order is hidden. ${'More words. '.repeat(40)}`,
      ]),
    );

    await planDataModel(call, { cards: [entity, ...rules], brief: briefOf('SQL Server') });

    const message = requests[0]?.messages.map((each) => each.content).join('\n') ?? '';
    expect(message.length / 4).toBeLessThanOrEqual(promptBudgetTokens(window));
    expect(message).toContain('supported cards are not shown in full');
    expect(message).toContain('BR-299');
  });
});
