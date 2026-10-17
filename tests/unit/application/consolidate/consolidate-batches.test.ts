import { describe, expect, it } from 'vitest';
import {
  consolidateCards,
  type ConsolidationParts,
} from '../../../../src/application/consolidate/consolidate-cards.js';
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { entities, SMALL_BOUND } from '../../../support/merge-batch-fixtures.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-250, RF-422, RF-425, P2-35: the cards message to the summariser has a size bound: a type
// larger than it goes in batches, one call each; a refusal by a cap ends the step and keeps the
// cards.

function answer(text: string): LlmResponse {
  const usage = {
    inputTokens: 1,
    outputTokens: 1,
    cachedInputTokens: 0,
    usageSource: 'reported',
  } as const;
  return { text, toolCalls: [], usage, finishReason: 'stop', modelVersion: 'fake-1' };
}

const noMerge = (): LlmResponse => answer('{"merges": []}');

class Answers implements LlmProvider {
  readonly requests: LlmRequest[] = [];
  private readonly next: (call: number) => LlmResponse | Promise<LlmResponse>;

  constructor(next: (call: number) => LlmResponse | Promise<LlmResponse>) {
    this.next = next;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    return this.next(this.requests.length);
  }
}

function partsOf(provider: LlmProvider, batchTokens = SMALL_BOUND) {
  const logger = new RecordingLogger();
  const parts: ConsolidationParts = {
    ...{ provider, logger, batchTokens, ids: new SequenceIdGenerator() },
    signal: new AbortController().signal,
    role: { model: 'm-1', maxOutputTokens: 900 },
    prompt: { name: 'summariser/merge.v1.md', version: 'v1', sha256: 'ab', text: 'Merge cards.' },
    ...{ runId: '20260101-000001-understand', traceId: 'a'.repeat(32) },
    nextCallId: () => '20260101-000001-understand#9',
    onAnswer: () => Promise.resolve(),
  };
  return { parts, logger };
}

const shown = (request: LlmRequest | undefined): string[] =>
  [...(request?.messages[0]?.content.matchAll(/"id": "(ENT-\d+)"/gu) ?? [])].map((m) => m[1] ?? '');

describe('consolidateCards, a type larger than the bound', () => {
  it('RF-250 P2-35 is sent in batches of the cards that fit, one call each, in card order', async () => {
    const provider = new Answers(noMerge);
    const { parts } = partsOf(provider);

    await consolidateCards(parts, entities(6));

    expect(provider.requests.map(shown)).toEqual([
      ['ENT-001', 'ENT-002'],
      ['ENT-003', 'ENT-004'],
      ['ENT-005', 'ENT-006'],
    ]);
    expect(provider.requests.map((request) => request.context.agentTaskId)).toEqual([
      'summariser-ent-1',
      'summariser-ent-2',
      'summariser-ent-3',
    ]);
  });

  it('RF-250 P2-35 a type that fits the bound is one call with the task id it always had', async () => {
    const provider = new Answers(noMerge);
    const { parts } = partsOf(provider, 100_000);

    await consolidateCards(parts, entities(6));

    expect(provider.requests.map(shown)).toEqual([
      ['ENT-001', 'ENT-002', 'ENT-003', 'ENT-004', 'ENT-005', 'ENT-006'],
    ]);
    expect(provider.requests[0]?.context.agentTaskId).toBe('summariser-ent');
  });
});

describe('consolidateCards, the batches it makes and the merges in them', () => {
  it('RF-250 P2-35 a batch of one card is not sent: it has nothing to be merged with', async () => {
    const provider = new Answers(noMerge);
    const { parts } = partsOf(provider);

    await consolidateCards(parts, entities(5));

    expect(provider.requests.map(shown)).toEqual([
      ['ENT-001', 'ENT-002'],
      ['ENT-003', 'ENT-004'],
    ]);
  });

  it('RF-250 P2-35 the merges of every batch apply, and a card of another batch is not merged', async () => {
    const replies = [
      { merges: [{ ids: ['ENT-001', 'ENT-002'], title: 'First', summary: 'One.' }] },
      { merges: [{ ids: ['ENT-001', 'ENT-004'], title: 'Wrong', summary: 'Not shown.' }] },
      { merges: [{ ids: ['ENT-005', 'ENT-006'], title: 'Third', summary: 'Three.' }] },
    ];
    const provider = new Answers((call) => answer(JSON.stringify(replies[call - 1])));
    const { parts, logger } = partsOf(provider);

    const result = await consolidateCards(parts, entities(6));

    expect(result.cards.map((card) => card.id)).toEqual([
      'ENT-001',
      'ENT-003',
      'ENT-004',
      'ENT-005',
    ]);
    expect(result.merges.map((merge) => merge.title)).toEqual(['First', 'Third']);
    expect(logger.records.filter((record) => record.level === 'warn')).toHaveLength(1);
  });
});

describe('consolidateCards, what it answered', () => {
  it('P2-35 names the type once every batch of it was answered', async () => {
    const { parts } = partsOf(new Answers(noMerge));

    const result = await consolidateCards(parts, entities(6));

    expect(result.answered).toEqual(['ENT']);
    expect(result.capped).toBe(false);
  });

  it('P2-35 does not name a type one of whose batches failed', async () => {
    const provider = new Answers((call) =>
      call === 2
        ? Promise.reject(new RosettaError(ERROR_CODES.providerCallFailed, 'Down.'))
        : noMerge(),
    );
    const { parts } = partsOf(provider);

    const result = await consolidateCards(parts, entities(6));

    expect(provider.requests).toHaveLength(3);
    expect(result.answered).toEqual([]);
  });

  it('P2-35 does not ask again about a type it is told to skip', async () => {
    const provider = new Answers(noMerge);
    const { parts } = partsOf(provider);

    const result = await consolidateCards(parts, entities(6), { skip: new Set(['ENT']) });

    expect(provider.requests).toEqual([]);
    expect(result.answered).toEqual([]);
  });
});

describe('consolidateCards when a cap refuses the call', () => {
  const refused = () => Promise.reject(new RosettaError(ERROR_CODES.budgetCapReached));

  it('RF-422 P2-35 ends the step at the refusal: no further batch is sent, the cards stay', async () => {
    const provider = new Answers((call) => (call === 1 ? noMerge() : refused()));
    const { parts, logger } = partsOf(provider);
    const before = entities(6);

    const result = await consolidateCards(parts, before);

    expect(provider.requests).toHaveLength(2);
    expect(result.cards).toEqual(before);
    expect(result.capped).toBe(true);
    expect(result.answered).toEqual([]);
    expect(logger.records).toMatchObject([
      { level: 'warn', code: ERROR_CODES.budgetCapReached, agentTaskId: 'summariser-ent-2' },
    ]);
  });

  it('RF-422 P2-35 keeps the merges the earlier calls made', async () => {
    const first = { merges: [{ ids: ['ENT-001', 'ENT-002'], title: 'First', summary: 'One.' }] };
    const provider = new Answers((call) =>
      call === 1 ? answer(JSON.stringify(first)) : refused(),
    );
    const { parts } = partsOf(provider);

    const result = await consolidateCards(parts, entities(6));

    expect(result.cards.map((card) => card.id)).toEqual([
      'ENT-001',
      'ENT-003',
      'ENT-004',
      'ENT-005',
      'ENT-006',
    ]);
    expect(result.capped).toBe(true);
  });
});
