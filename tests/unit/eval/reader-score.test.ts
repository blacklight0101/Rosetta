import { describe, expect, it } from 'vitest';
import {
  recommend,
  renderTable,
  scoreRun,
  type ReaderScore,
  type RunOutcome,
} from '../../../eval/spike/reader-score.js';
import type { CardDraft } from '../../../src/domain/cards/card-ids.js';
import { agentCodeMap } from '../../support/agent-fixtures.js';

// Q-04, P1-47: the scoring of the reader model spike.

const shipping = 'src/Orders/OrderService.cs';

function draft(startLine: number, endLine: number): CardDraft {
  return {
    type: 'BR',
    title: 'Shipping is free above 50',
    summary: 'Orders above 50 ship free.',
    area: 'orders',
    confidence: 'High',
    claims: [
      { text: 'Free shipping above 50.', citations: [{ path: shipping, startLine, endLine }] },
    ],
  };
}

function outcome(drafts: readonly CardDraft[], ended: 'Done' | 'TurnLimitReached'): RunOutcome {
  return {
    state: ended,
    reason: ended === 'Done' ? 'final-answer' : 'max-turns',
    drafts,
    problems: [],
    turns: 3,
    toolErrors: 1,
  };
}

function score(model: string, extra: Partial<ReaderScore> = {}): ReaderScore {
  return {
    model,
    state: 'Done',
    code: undefined,
    turns: 3,
    cards: 2,
    rejected: 0,
    claims: 4,
    validClaims: 4,
    toolErrors: 0,
    seconds: 10,
    ...extra,
  };
}

describe('reader spike scoring', () => {
  it('Q-04 counts the cards and the claims whose citations hold in the code map', () => {
    const drafts = [draft(5, 5), draft(1, 99)];

    const scored = scoreRun('good:8b', outcome(drafts, 'Done'), agentCodeMap, 12.5);

    expect(scored).toMatchObject({
      model: 'good:8b',
      state: 'Done',
      cards: 2,
      claims: 2,
      validClaims: 1,
      toolErrors: 1,
      turns: 3,
      seconds: 12.5,
    });
  });

  it('Q-04 a task that did not end with an answer has no cards', () => {
    const scored = scoreRun('slow:7b', outcome([], 'TurnLimitReached'), agentCodeMap, 90);

    expect(scored).toMatchObject({ state: 'TurnLimitReached', cards: 0, claims: 0 });
  });

  it('Q-04 recommends the best share of valid citations, then fewer tool errors, then speed', () => {
    const best = recommend([
      score('sloppy', { validClaims: 2 }),
      score('slow', { seconds: 40 }),
      score('fast', { seconds: 20 }),
      score('failed', { state: 'TurnLimitReached', cards: 0, claims: 0, validClaims: 0 }),
    ]);

    expect(best).toBe('fast');
  });

  it('Q-04 recommends nothing when no model ended with a card', () => {
    expect(recommend([score('a', { cards: 0, claims: 0, validClaims: 0 })])).toBeUndefined();
  });

  it('Q-04 renders a table with a row per model, the date and the recommendation', () => {
    const rows = [score('a:8b'), score('b:7b', { state: 'Failed', code: 'RST-1507' })];

    const table = renderTable(rows, { date: '2026-10-17', repo: 'demo', area: 'Services' });

    expect(table).toContain('2026-10-17');
    expect(table).toContain('| a:8b | Done | 2 (0 rejected) | 4/4 | 0 | 3 | 10.0 |');
    expect(table).toContain('| b:7b | Failed (RST-1507) |');
    expect(table).toContain('Recommended model: `a:8b`.');
  });
});
