import { describe, expect, it } from 'vitest';
import type { ConsolidationParts } from '../../../../src/application/consolidate/consolidate-cards.js';
import { consolidateRun } from '../../../../src/application/consolidate/consolidate-run.js';
import type { LlmProvider } from '../../../../src/application/ports/llm-provider.js';
import type {
  ConsolidationRecord,
  TaskResults,
} from '../../../../src/application/ports/task-results.js';
import type { Card } from '../../../../src/domain/cards/card.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// P5-32: the page merge and the cross-area merge run without a model call and are recorded in
// consolidation.json; switching the page merge off brings the cards back.

const scope = { id: 'r', userId: 'u', projectId: 'p', runKey: '20260101-000001-understand' };

const silent: LlmProvider = {
  complete: () =>
    Promise.resolve({
      text: '{"merges": []}',
      toolCalls: [],
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        cachedInputTokens: 0,
        usageSource: 'reported',
      },
      finishReason: 'stop',
      modelVersion: 'fake-1',
    }),
};

class MemoryStore implements Pick<TaskResults, 'readConsolidation' | 'writeConsolidation'> {
  record: ConsolidationRecord = { types: [], merges: [] };
  readConsolidation(): Promise<ConsolidationRecord> {
    return Promise.resolve(this.record);
  }
  writeConsolidation(_scope: unknown, record: ConsolidationRecord): Promise<void> {
    this.record = record;
    return Promise.resolve();
  }
}

function partsOf(): ConsolidationParts {
  return {
    ...{ provider: silent, logger: new RecordingLogger(), batchTokens: 100_000 },
    ...{ ids: new SequenceIdGenerator(), signal: new AbortController().signal },
    role: { model: 'm-1', maxOutputTokens: 900 },
    prompt: { name: 'summariser/merge.v1.md', version: 'v1', sha256: 'ab', text: 'Merge.' },
    ...{ runId: scope.runKey, traceId: 'a'.repeat(32), nextCallId: () => `${scope.runKey}#1` },
    onAnswer: () => Promise.resolve(),
  };
}

function screen(id: string, task: string, text: string): Card {
  return {
    ...{ id, type: 'SCRN', title: id, summary: id, area: 'web', agentTaskId: task },
    confidence: 'High',
    claims: [
      {
        claimId: `${id}.c1`,
        text,
        citations: [{ path: 'Pages/Orders.cshtml', startLine: 1, endLine: 2 }],
        status: 'Supported',
      },
    ],
    screen: { route: '/Orders', roles: [], fields: [], actions: [], leadsTo: [] },
  };
}

const three = [
  screen('SCRN-001', 't1', 'A.'),
  screen('SCRN-002', 't2', 'B.'),
  screen('SCRN-003', 't3', 'C.'),
];

describe('P5-32 consolidateRun page merge', () => {
  it('merges three cards of one page and records the merge', async () => {
    const store = new MemoryStore();

    const result = await consolidateRun(partsOf(), { store, scope }, three);

    expect(result.cards.map((card) => card.id)).toEqual(['SCRN-001']);
    expect(result.cards[0]?.mergedFrom).toEqual(['SCRN-001', 'SCRN-002', 'SCRN-003']);
    expect(store.record.merges.map((merge) => merge.ids)).toEqual([
      ['SCRN-001', 'SCRN-002', 'SCRN-003'],
    ]);
  });

  it('mutation: with the page merge off the three cards return', async () => {
    const store = new MemoryStore();

    const result = await consolidateRun(partsOf(), { store, scope }, three, { pages: false });

    expect(result.cards.map((card) => card.id)).toEqual(['SCRN-001', 'SCRN-002', 'SCRN-003']);
    expect(store.record.merges).toEqual([]);
  });
});
