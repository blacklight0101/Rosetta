import { describe, expect, it } from 'vitest';
import type { ConsolidationParts } from '../../../../src/application/consolidate/consolidate-cards.js';
import { consolidateRun } from '../../../../src/application/consolidate/consolidate-run.js';
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../../src/application/ports/llm-provider.js';
import type {
  ConsolidationRecord,
  TaskResults,
} from '../../../../src/application/ports/task-results.js';
import type { Card } from '../../../../src/domain/cards/card.js';
import { entities } from '../../../support/merge-batch-fixtures.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-250, RF-006, P2-35: a resumed run does not ask the summariser again about a card type it
// already merged, and a merge it made before is made again as it was, so the surviving card keeps
// its id (answers.md keys on card ids).

const scope = { id: 'r', userId: 'u', projectId: 'p', runKey: '20260101-000001-understand' };
const pair = { ids: ['ENT-001', 'ENT-002'], title: 'First', summary: 'One.' };

function answer(text: string): LlmResponse {
  const usage = {
    inputTokens: 1,
    outputTokens: 1,
    cachedInputTokens: 0,
    usageSource: 'reported',
  } as const;
  return { text, toolCalls: [], usage, finishReason: 'stop', modelVersion: 'fake-1' };
}

class Answers implements LlmProvider {
  readonly requests: LlmRequest[] = [];
  private readonly texts: string[];

  constructor(texts: readonly string[]) {
    this.texts = [...texts];
  }

  complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    return Promise.resolve(answer(this.texts.shift() ?? '{"merges": []}'));
  }
}

class MemoryStore implements Pick<TaskResults, 'readConsolidation' | 'writeConsolidation'> {
  record: ConsolidationRecord;

  constructor(record: ConsolidationRecord = { types: [], merges: [] }) {
    this.record = record;
  }

  readConsolidation(): Promise<ConsolidationRecord> {
    return Promise.resolve(this.record);
  }

  writeConsolidation(_scope: unknown, record: ConsolidationRecord): Promise<void> {
    this.record = record;
    return Promise.resolve();
  }
}

function partsOf(provider: LlmProvider): ConsolidationParts {
  return {
    ...{ provider, logger: new RecordingLogger(), batchTokens: 100_000 },
    ...{ ids: new SequenceIdGenerator(), signal: new AbortController().signal },
    role: { model: 'm-1', maxOutputTokens: 900 },
    prompt: { name: 'summariser/merge.v1.md', version: 'v1', sha256: 'ab', text: 'Merge cards.' },
    ...{ runId: scope.runKey, traceId: 'a'.repeat(32), nextCallId: () => `${scope.runKey}#1` },
    onAnswer: () => Promise.resolve(),
  };
}

const idsOf = (cards: readonly Card[]): string[] => cards.map((card) => card.id);
const shownIn = (request: LlmRequest | undefined): string =>
  [...(request?.messages[0]?.content.matchAll(/"id": "(ENT-\d+)"/gu) ?? [])]
    .map((m) => m[1])
    .join(',');

describe('consolidateRun, a first time', () => {
  it('RF-250 P2-35 asks about the type, merges, and records the type and the merge', async () => {
    const provider = new Answers([JSON.stringify({ merges: [pair] })]);
    const store = new MemoryStore();

    const result = await consolidateRun(partsOf(provider), { store, scope }, entities(3));

    expect(idsOf(result.cards)).toEqual(['ENT-001', 'ENT-003']);
    expect(store.record).toEqual({
      types: [{ type: 'ENT', cardIds: ['ENT-001', 'ENT-002', 'ENT-003'] }],
      merges: [pair],
    });
  });

  it('RF-250 P2-35 records a type the summariser answered with no merge, so it is not asked again', async () => {
    const store = new MemoryStore();

    await consolidateRun(partsOf(new Answers([])), { store, scope }, entities(2));

    expect(store.record).toEqual({
      types: [{ type: 'ENT', cardIds: ['ENT-001', 'ENT-002'] }],
      merges: [],
    });
  });

  it('RF-250 P2-35 records nothing for a type whose answer was not usable', async () => {
    const store = new MemoryStore();

    await consolidateRun(partsOf(new Answers(['Maybe.'])), { store, scope }, entities(2));

    expect(store.record).toEqual({ types: [], merges: [] });
  });
});

describe('consolidateRun, a resume', () => {
  const merged: ConsolidationRecord = {
    types: [{ type: 'ENT', cardIds: ['ENT-001', 'ENT-002', 'ENT-003'] }],
    merges: [pair],
  };

  it('RF-006 P2-35 does not ask again about a type merged before; the merge is made again', async () => {
    const provider = new Answers([]);
    const store = new MemoryStore(merged);

    const result = await consolidateRun(partsOf(provider), { store, scope }, entities(3));

    expect(provider.requests).toEqual([]);
    expect(idsOf(result.cards)).toEqual(['ENT-001', 'ENT-003']);
    expect(result.cards[0]?.mergedFrom).toEqual(['ENT-001', 'ENT-002']);
    expect(result.merges).toEqual([pair]);
    expect(result.moves).toEqual([]);
    expect(store.record).toEqual(merged);
  });

  it('RF-006 P2-35 asks again only when a card of the type is new, and shows the survivor, not the card it absorbed', async () => {
    const provider = new Answers([
      JSON.stringify({
        merges: [{ ids: ['ENT-001', 'ENT-004'], title: 'Second', summary: 'Two.' }],
      }),
    ]);
    const store = new MemoryStore(merged);

    const result = await consolidateRun(partsOf(provider), { store, scope }, entities(4));

    expect(provider.requests.map(shownIn)).toEqual(['ENT-001,ENT-003,ENT-004']);
    expect(idsOf(result.cards)).toEqual(['ENT-001', 'ENT-003']);
    expect(result.cards[0]?.mergedFrom).toEqual(['ENT-001', 'ENT-002', 'ENT-004']);
    expect(store.record.merges.map((each) => each.title)).toEqual(['First', 'Second']);
    expect(store.record.types).toEqual([
      { type: 'ENT', cardIds: ['ENT-001', 'ENT-002', 'ENT-003', 'ENT-004'] },
    ]);
  });

  it('RF-250 P2-35 a merge made before that no longer applies is dropped from the record', async () => {
    const stale = { ids: ['ENT-001', 'ENT-009'], title: 'Gone', summary: 'Gone.' };
    const store = new MemoryStore({ types: merged.types, merges: [stale, pair] });

    const result = await consolidateRun(partsOf(new Answers([])), { store, scope }, entities(3));

    expect(idsOf(result.cards)).toEqual(['ENT-001', 'ENT-003']);
    expect(store.record.merges).toEqual([pair]);
  });
});
