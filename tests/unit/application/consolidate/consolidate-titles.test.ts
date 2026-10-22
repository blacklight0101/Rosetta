import { describe, expect, it } from 'vitest';
import type { ConsolidationParts } from '../../../../src/application/consolidate/consolidate-cards.js';
import { consolidateRun } from '../../../../src/application/consolidate/consolidate-run.js';
import type { LlmProvider, LlmRequest } from '../../../../src/application/ports/llm-provider.js';
import type { ConsolidationRecord } from '../../../../src/application/ports/task-results.js';
import type { Card } from '../../../../src/domain/cards/card.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// P3-106, RF-230, RF-250, RF-006: cards with one title are merged without asking the summariser,
// the merge is recorded, and a resume makes it again.

const scope = { id: 'r', userId: 'u', projectId: 'p', runKey: '20260101-000001-understand' };

class NoCalls implements LlmProvider {
  readonly requests: LlmRequest[] = [];

  complete(request: LlmRequest): Promise<never> {
    this.requests.push(request);
    return Promise.reject(new Error('The title merge needs no model call.'));
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

function flow(id: string, text: string): Card {
  return {
    ...{ id, type: 'FLOW', title: 'Invoice Generation Process', summary: 'S', area: 'a' },
    ...{ agentTaskId: `t-${id}`, confidence: 'High', flow: { trigger: 't', outcome: 'o' } },
    claims: [
      {
        claimId: `${id}.c1`,
        text,
        citations: [{ path: 'a.md', startLine: 1, endLine: 2 }],
        status: 'Proposed',
      },
    ],
  };
}

function memory(initial: ConsolidationRecord = { types: [], merges: [] }) {
  const store = {
    record: initial,
    readConsolidation: () => Promise.resolve(store.record),
    writeConsolidation: (_scope: unknown, record: ConsolidationRecord) => {
      store.record = record;
      return Promise.resolve();
    },
  };
  return store;
}

const flows = [flow('FLOW-001', 'One.'), flow('FLOW-002', 'Two.')];

describe('P3-106 consolidateRun: cards with one title', () => {
  it('RF-230 merges them with no model call and records the merge', async () => {
    const provider = new NoCalls();
    const store = memory();

    const result = await consolidateRun(partsOf(provider), { store, scope }, flows);

    expect(provider.requests).toEqual([]);
    expect(result.cards.map((card) => card.id)).toEqual(['FLOW-001']);
    expect(result.cards[0]?.claims.map((claim) => claim.text)).toEqual(['One.', 'Two.']);
    expect(result.merges).toHaveLength(1);
    expect(result.moves.map((move) => move.from)).toEqual([['FLOW-001', 'FLOW-002']]);
    expect(store.record.merges).toEqual(result.merges);
  });

  it('RF-006 a resume makes the recorded merge again and records nothing new', async () => {
    const first = memory();
    await consolidateRun(partsOf(new NoCalls()), { store: first, scope }, flows);
    const again = memory(first.record);

    const result = await consolidateRun(partsOf(new NoCalls()), { store: again, scope }, flows);

    expect(result.cards.map((card) => card.id)).toEqual(['FLOW-001']);
    expect(result.merges).toEqual(first.record.merges);
    expect(result.replayedMoves).toHaveLength(1);
    expect(result.moves).toEqual([]);
    expect(again.record).toEqual(first.record);
  });
});

describe('P3-106 consolidateRun: a card with a repeated claim', () => {
  it('EV-05 keeps the claim once, with no merge and no model call, and says where the claims went', async () => {
    const provider = new NoCalls();
    const one = flow('ENT-001', 'Same.');
    const repeated: Card = { ...one, type: 'ENT', claims: [...one.claims, ...one.claims] };

    const result = await consolidateRun(partsOf(provider), { store: memory(), scope }, [repeated]);

    expect(provider.requests).toEqual([]);
    expect(result.merges).toEqual([]);
    expect(result.cards[0]?.claims).toHaveLength(1);
    expect(result.moves).toHaveLength(1);
  });
});
