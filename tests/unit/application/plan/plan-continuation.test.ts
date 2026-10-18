import { describe, expect, it } from 'vitest';
import {
  cutOffMessage,
  isCutOff,
  joinContinuation,
} from '../../../../src/application/plan/plan-continuation.js';

// RF-604, RF-007: when a planner answer counts as cut off, how a continuation is joined to it, and
// the message of one that stays cut off.

const limit = 100;

describe('isCutOff', () => {
  it('RF-604 a length stop with unclosed JSON is cut off', () => {
    expect(isCutOff('{"a": [1,', { finishReason: 'length', outputTokens: 5 }, limit)).toBe(true);
  });

  it('RF-604 a length stop with prose and no JSON at all is cut off', () => {
    expect(isCutOff('Here is the plan: ', { finishReason: 'length', outputTokens: 5 }, limit)).toBe(
      true,
    );
  });

  it('RF-604 a length stop after a closed JSON object is not cut off', () => {
    const end = { finishReason: 'length', outputTokens: 5 } as const;

    expect(isCutOff('{"a": [1]}', end, limit)).toBe(false);
  });

  it('RF-604 no stop reason: the whole limit used and unclosed JSON is cut off', () => {
    expect(isCutOff('{"a": [1,', { finishReason: 'stop', outputTokens: limit }, limit)).toBe(true);
  });

  it('RF-604 no stop reason: unclosed JSON below the limit, or closed JSON at it, is not cut off', () => {
    expect(isCutOff('{"a": [1,', { finishReason: 'stop', outputTokens: limit - 1 }, limit)).toBe(
      false,
    );
    expect(isCutOff('{"a": [1]}', { finishReason: 'stop', outputTokens: limit }, limit)).toBe(
      false,
    );
  });

  it('RF-604 braces in prose do not make an answer cut off', () => {
    const end = { finishReason: 'stop', outputTokens: limit } as const;

    expect(isCutOff('Use {x} for the name.', end, limit)).toBe(false);
  });
});

describe('joinContinuation', () => {
  it('RF-604 joins the fragment to the answer as written', () => {
    expect(joinContinuation('{"a": [1,', ' 2]}')).toBe('{"a": [1, 2]}');
  });

  it('RF-604 keeps a short repeated stretch: it may be real text', () => {
    expect(joinContinuation('{"a": [1, 2', ', 2]}')).toBe('{"a": [1, 2, 2]}');
  });

  it('RF-604 keeps white space that both sides hold', () => {
    const earlier = `{"a": "x${' '.repeat(14)}`;

    expect(joinContinuation(earlier, `${' '.repeat(14)}y"}`)).toBe(`{"a": "x${' '.repeat(28)}y"}`);
  });

  it('RF-604 drops the tail the fragment repeats', () => {
    const earlier = '{"title": "Place an order", "sta';

    expect(joinContinuation(earlier, '"Place an order", "statement": "Pay."}')).toBe(
      '{"title": "Place an order", "statement": "Pay."}',
    );
  });

  it('RF-604 a fragment that starts the answer again replaces it', () => {
    const earlier = '{"requirements": [{"title": "A", "sta';
    const again = '{"requirements": [{"title": "A", "statement": "B"}]}';

    expect(joinContinuation(earlier, again)).toBe(again);
  });

  it('RF-604 a short answer is not mistaken for a restart', () => {
    expect(joinContinuation('{"a"', '{"a"')).toBe('{"a"{"a"');
  });
});

describe('cutOffMessage', () => {
  it('RF-007 names the token count and the setting', () => {
    expect(cutOffMessage(4096)).toBe(
      'The planner answer was cut off at 4096 output tokens; raise Planner max output tokens in Project settings.',
    );
  });
});
