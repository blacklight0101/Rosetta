import { describe, expect, it } from 'vitest';
import type { DeepenEstimate } from '../../../web/src/api/understanding.js';
import {
  allRoundsText,
  firstRoundText,
  overCapTexts,
} from '../../../web/src/lib/understanding/deepen-estimate-text.js';

// RF-209, RF-427 (Q-44): the estimate of a Deepen with a local model is in tokens and never warns
// that "$0.00 could pass the run cap"; a priced model keeps dollars and warns when its figure is over
// a cap. A warning names the cap it is about: a cost cap in dollars, a token cap in tokens.

const point = (tokens: number, micros: number) => ({
  inputTokens: tokens * 0.75,
  outputTokens: tokens * 0.25,
  costMicros: String(micros),
});
const range = (low: number, likely: number, high: number, perToken = 0) => ({
  low: point(low, low * perToken),
  likely: point(likely, likely * perToken),
  high: point(high, high * perToken),
});
const role = (kind: string) => ({
  ...{ role: 'reader', provider: kind, kind, model: 'm', keySource: 'user', priced: true },
  ...range(1, 2, 3),
});

function estimate(kind: string, change: Partial<DeepenEstimate> = {}): DeepenEstimate {
  const perToken = kind === 'ollama' ? 0 : 10;
  return {
    currency: 'USD',
    maxRounds: 3,
    coveragePass: true,
    plan: {
      judge: 10,
      reread: 40,
      outOfScope: 0,
      failedAreas: 0,
      answers: 0,
      unreadFiles: 0,
      unreadTokens: 0,
    },
    roles: [role(kind)],
    round: range(20_000, 40_000, 90_000, perToken),
    allRounds: range(60_000, 120_000, 270_000, perToken),
    cap: { maxCostMicros: 2_000_000, maxTokens: 1_000_000 },
    overCap: { round: false, allRounds: false },
    ...change,
  };
}

describe('RF-209 the estimate of a Deepen with a local model', () => {
  it('RF-209 gives the first round in tokens, not dollars', () => {
    const text = firstRoundText(estimate('ollama'));

    expect(text).toContain(
      'First round: likely 40,000 tokens (low 20,000 tokens, high 90,000 tokens).',
    );
    expect(text).not.toContain('$');
  });

  it('RF-209 gives all rounds in tokens and names the token cap as what stops the run', () => {
    const text = allRoundsText(estimate('ollama'));

    expect(text).toContain(
      'Up to 3 rounds: likely 120,000 tokens (low 60,000 tokens, high 270,000 tokens).',
    );
    expect(text).toContain('1,000,000 tokens is what stops the run');
    expect(text).not.toContain('$');
  });

  it('RF-427 does not warn about the run cap in dollars when the figures are well under it', () => {
    expect(overCapTexts(estimate('ollama'))).toEqual([]);
  });

  it('RF-427 never shows "$0.00 could pass the run cap", even if the server flags the cost cap', () => {
    const flagged = estimate('ollama', { overCap: { round: true, allRounds: true } });

    const texts = overCapTexts(flagged);

    for (const text of texts) expect(text).not.toContain('$');
    expect(texts).toEqual([]);
  });

  it('RF-427 warns in tokens when the tokens themselves could pass the token cap', () => {
    const big = estimate('ollama', {
      round: range(20_000, 40_000, 1_500_000),
      overCap: { round: true, allRounds: false },
    });

    expect(overCapTexts(big)).toEqual([
      'The high figure for the first round (1,500,000 tokens) could pass the run token cap (1,000,000 tokens). The run stops cleanly at the cap and can be resumed.',
    ]);
  });
});

describe('RF-427 the estimate of a Deepen with a priced model', () => {
  it('RF-209 keeps the figures in dollars', () => {
    expect(firstRoundText(estimate('anthropic'))).toContain(
      'First round: likely $0.40 (low $0.20, high $0.90).',
    );
  });

  it('RF-427 warns in dollars when the high figure could pass the cost cap', () => {
    const over = estimate('anthropic', {
      round: range(20_000, 40_000, 300_000, 10),
      overCap: { round: true, allRounds: false },
    });

    expect(overCapTexts(over)).toEqual([
      'The high figure for the first round ($3.00) could pass the run cap ($2.00). The run stops cleanly at the cap and can be resumed.',
    ]);
  });

  it('RF-427 warns in tokens, not dollars, when only the token cap could be passed', () => {
    const over = estimate('anthropic', {
      round: range(20_000, 40_000, 1_500_000, 0),
      overCap: { round: true, allRounds: false },
    });

    expect(overCapTexts(over)).toEqual([
      'The high figure for the first round (1,500,000 tokens) could pass the run token cap (1,000,000 tokens). The run stops cleanly at the cap and can be resumed.',
    ]);
  });
});
