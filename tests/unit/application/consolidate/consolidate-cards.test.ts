import { describe, expect, it } from 'vitest';
import { consolidateCards } from '../../../../src/application/consolidate/consolidate-cards.js';
import type { ConsolidationParts } from '../../../../src/application/consolidate/consolidate-cards.js';
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import {
  cardsAcrossAreas,
  oneTaskTwoCards,
  twoTasksOneArea,
} from '../../../support/merge-fixtures.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-250, ADR-005: the summariser step on its own, over a provider that answers from a list.

const merge = { ids: ['ENT-001', 'ENT-002'], title: 'Customer', summary: 'One buyer.' };

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
  private readonly next: () => LlmResponse | Promise<LlmResponse>;

  constructor(next: () => LlmResponse | Promise<LlmResponse>) {
    this.next = next;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    return this.next();
  }
}

function partsOf(provider: LlmProvider, signal = new AbortController().signal) {
  const logger = new RecordingLogger();
  const answers: string[] = [];
  const parts: ConsolidationParts = {
    ...{ provider, logger, signal, ids: new SequenceIdGenerator(), batchTokens: 100_000 },
    role: { model: 'm-1', maxOutputTokens: 900, temperature: 0.2 },
    prompt: { name: 'summariser/merge.v1.md', version: 'v1', sha256: 'ab', text: 'Merge cards.' },
    ...{ runId: '20260101-000001-understand', traceId: 'a'.repeat(32) },
    nextCallId: () => '20260101-000001-understand#9',
    onAnswer: (response) => Promise.resolve(void answers.push(response.modelVersion)),
  };
  return { parts, logger, answers };
}

describe('consolidateCards', () => {
  it('RF-250 asks once for the type two areas wrote, with the role settings and no tool', async () => {
    const provider = new Answers(() => answer(JSON.stringify({ merges: [merge] })));
    const { parts, answers } = partsOf(provider);

    const result = await consolidateCards(parts, cardsAcrossAreas());

    expect(result.merges).toEqual([merge]);
    expect(result.cards.map((card) => card.id)).toEqual(['ENT-001', 'BR-001', 'OQ-001']);
    expect(answers).toEqual(['fake-1']);
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]).toMatchObject({
      model: 'm-1',
      system: 'Merge cards.',
      tools: [],
      maxOutputTokens: 900,
      temperature: 0.2,
      context: {
        role: 'summariser',
        agentTaskId: 'summariser-ent',
        callId: '20260101-000001-understand#9',
      },
    });
  });

  it('RF-250 a run already stopped asks nothing', async () => {
    const stopped = new AbortController();
    stopped.abort();
    const provider = new Answers(() => answer('{"merges": []}'));
    const { parts } = partsOf(provider, stopped.signal);

    const result = await consolidateCards(parts, cardsAcrossAreas());

    expect(provider.requests).toHaveLength(0);
    expect(result.merges).toEqual([]);
  });
});

describe('consolidateCards, cards of one area (Q-52)', () => {
  it('RF-250 cards of one area from two reader tasks are asked about and merged (Q-52)', async () => {
    const same = { ids: ['SCRN-001', 'SCRN-002'], title: 'Sheet1', summary: 'One screen.' };
    const provider = new Answers(() => answer(JSON.stringify({ merges: [same] })));
    const { parts } = partsOf(provider);

    const result = await consolidateCards(parts, twoTasksOneArea('SCRN'));

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.context.agentTaskId).toBe('summariser-scrn');
    expect(result.merges).toEqual([same]);
    expect(result.cards.map((card) => card.id)).toEqual(['SCRN-001']);
  });

  it('RF-250 two cards that one reader task wrote cost no summariser call (Q-52)', async () => {
    const provider = new Answers(() => answer('{"merges": []}'));
    const { parts } = partsOf(provider);

    const result = await consolidateCards(parts, oneTaskTwoCards('ENT'));

    expect(provider.requests).toHaveLength(0);
    expect(result.cards).toHaveLength(2);
  });

  it('RF-250 a failed call within one area leaves the cards and the run goes on (Q-52)', async () => {
    const provider = new Answers(() =>
      Promise.reject(new RosettaError(ERROR_CODES.providerCallFailed, 'Down.')),
    );
    const { parts } = partsOf(provider);

    const result = await consolidateCards(parts, twoTasksOneArea('FEAT'));

    expect(result.cards).toHaveLength(2);
    expect(result.capped).toBe(false);
  });
});

describe('consolidateCards when the summariser gives nothing usable', () => {
  it('RF-250 a stop during the call is not a warning and keeps the cards', async () => {
    const stop = new AbortController();
    const provider = new Answers(() => {
      stop.abort();
      return Promise.reject(new RosettaError(ERROR_CODES.providerCallFailed, 'Stopped.'));
    });
    const { parts, logger } = partsOf(provider, stop.signal);
    const before = cardsAcrossAreas();

    const result = await consolidateCards(parts, before);

    expect(result.cards).toEqual(before);
    expect(logger.records).toEqual([]);
  });

  it('RF-250 a failing call is a warning with its code and keeps the cards', async () => {
    const provider = new Answers(() =>
      Promise.reject(new RosettaError(ERROR_CODES.providerCallFailed, 'Down.')),
    );
    const { parts, logger } = partsOf(provider);
    const before = cardsAcrossAreas();

    const result = await consolidateCards(parts, before);

    expect(result.cards).toEqual(before);
    expect(logger.records).toMatchObject([
      { level: 'warn', code: ERROR_CODES.providerCallFailed, agentTaskId: 'summariser-ent' },
    ]);
  });

  it('RF-250 an answer that is no list is a warning and keeps the cards', async () => {
    const { parts, logger } = partsOf(new Answers(() => answer('Probably the same.')));
    const before = cardsAcrossAreas();

    const result = await consolidateCards(parts, before);

    expect(result.cards).toEqual(before);
    expect(logger.records.map((record) => record.level)).toEqual(['warn']);
  });
});

describe('consolidateCards when ids are not those shown', () => {
  it('RF-250 ids of cards the summariser was not shown in that call are not merged', async () => {
    const replies = [JSON.stringify({ merges: [merge] }), '{"merges": []}'];
    const provider = new Answers(() => answer(replies.shift() ?? ''));
    const { parts, logger } = partsOf(provider);
    const cards = cardsAcrossAreas();
    const rule = cards.find((card) => card.id === 'BR-001');
    if (rule === undefined) throw new Error('fixture');
    const twin = { ...rule, id: 'BR-002', area: 'Billing' };

    const result = await consolidateCards(parts, [...cards, twin]);

    expect(result.merges).toEqual([]);
    expect(logger.records.map((record) => record.level)).toEqual(['warn']);
  });
});
