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

// P5-12 (see consolidate-run.test.ts): merge groups. RF-250, RF-006, P2-35: a resumed run does not ask the summariser again about a card type it
// already merged, and a merge it made before is made again as it was, so the surviving card keeps
// its id (answers.md keys on card ids).

const scope = { id: 'r', userId: 'u', projectId: 'p', runKey: '20260101-000001-understand' };
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
function screens(): readonly Card[] {
  const base = entities(1)[0];
  if (base === undefined) throw new Error('no fixture');
  return ['/Default.aspx', '/Login.aspx'].map((route, index): Card => {
    const id = `SCRN-00${String(index + 1)}`;
    const screen = { route, roles: [], fields: [], actions: [], leadsTo: [] };
    return {
      ...base,
      ...{ id, type: 'SCRN', title: route, screen, agentTaskId: `t-${id}` },
      claims: base.claims.map((claim) => ({ ...claim, claimId: `${id}.c1` })),
    };
  });
}

describe('consolidateRun, merge groups (P5-12, EV-42)', () => {
  const group = (...ids: string[]) => ({ ids, title: `G ${ids.join('')}`, summary: 'Group.' });

  it('a card the summariser names in several groups stays in the first one', async () => {
    const answerText = JSON.stringify({
      merges: [
        group('ENT-001', 'ENT-002'),
        group('ENT-001', 'ENT-003'),
        group('ENT-003', 'ENT-004'),
      ],
    });
    const store = new MemoryStore();

    const result = await consolidateRun(
      partsOf(new Answers([answerText])),
      { store, scope },
      entities(4),
    );

    // The second group is dropped whole, so ENT-003 is free for the third group.
    expect(idsOf(result.cards)).toEqual(['ENT-001', 'ENT-003']);
    expect(result.cards[0]?.mergedFrom).toEqual(['ENT-001', 'ENT-002']);
    expect(result.cards[1]?.mergedFrom).toEqual(['ENT-003', 'ENT-004']);
  });

  it('an older record whose groups overlap replays to one group per card and is rewritten clean', async () => {
    const overlapping: ConsolidationRecord = {
      types: [{ type: 'ENT', cardIds: ['ENT-001', 'ENT-002', 'ENT-003', 'ENT-004'] }],
      merges: [
        group('ENT-001', 'ENT-002'),
        group('ENT-001', 'ENT-003'),
        group('ENT-003', 'ENT-004'),
      ],
    };
    const store = new MemoryStore(overlapping);

    const result = await consolidateRun(partsOf(new Answers([])), { store, scope }, entities(4));

    expect(idsOf(result.cards)).toEqual(['ENT-001', 'ENT-004']);
    const members = result.cards.flatMap((card) => card.mergedFrom ?? [card.id]);
    expect(new Set(members).size).toBe(members.length);
    expect(store.record.merges.map((each) => each.ids)).toEqual([
      ['ENT-001', 'ENT-002'],
      ['ENT-001', 'ENT-003'],
    ]);
  });
});

describe('consolidateRun, screens of two routes (P5-12, EV-42)', () => {
  const group = (...ids: string[]) => ({ ids, title: 'G', summary: 'Group.' });

  it('a start page and a login page the summariser proposes to merge stay two cards', async () => {
    const proposal = JSON.stringify({ merges: [group('SCRN-001', 'SCRN-002')] });
    const store = new MemoryStore();

    const result = await consolidateRun(
      partsOf(new Answers([proposal])),
      { store, scope },
      screens(),
    );

    expect(idsOf(result.cards)).toEqual(['SCRN-001', 'SCRN-002']);
    expect(store.record.merges).toEqual([]);
  });
});
