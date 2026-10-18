import { describe, expect, it } from 'vitest';
import {
  cutOffMessage,
  endsCutOff,
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

describe('joinContinuation: never altered JSON without saying so (P3-31)', () => {
  const items = '{"items": [{"id": "A"}, {"ti';

  it('RF-604 a prose fragment after a cut inside a key is not glued into the key', () => {
    const fragment = 'Sure, here is the rest: tle":"two"}]}';

    expect(joinContinuation(items, fragment)).toBe(items);
  });

  it('RF-604 a key remainder with white space or a colon is not a key', () => {
    expect(joinContinuation(items, 'me stamp":"two"}]}')).toBe(items);
    expect(joinContinuation(items, 'tle:x":"two"}]}')).toBe(items);
    expect(joinContinuation(items, 'tle,x":"two"}]}')).toBe(items);
  });

  it('RF-604 a plain rest of the key is joined', () => {
    expect(joinContinuation(items, 'tle":"two"}]}')).toBe(`${items}tle":"two"}]}`);
  });
});

describe('joinContinuation: a cut inside a value or after a string (P3-31)', () => {
  it('RF-604 a prose preamble after a cut inside a value is not glued into the value', () => {
    const earlier = '{"statement": "Pay the or';
    const fragment = 'Certainly! Here is the rest: der"}';

    expect(joinContinuation(earlier, fragment)).toBe(earlier);
  });

  it('RF-604 value text that starts like a preamble but has no colon is joined', () => {
    const earlier = '{"statement": "';

    expect(joinContinuation(earlier, 'Sure thing, yes."}')).toBe(
      '{"statement": "Sure thing, yes."}',
    );
  });

  it('RF-604 a value remainder with spaces is joined: only a key must be one word', () => {
    expect(joinContinuation('{"statement": "Pay the', ' order now."}')).toBe(
      '{"statement": "Pay the order now."}',
    );
  });

  it('RF-604 an escaped quote does not end the string the cut is in', () => {
    const earlier = '{"statement": "say \\"';

    expect(joinContinuation(earlier, 'Sure, here is the rest: hi\\""}')).toBe(earlier);
  });

  it('RF-604 prose after a string that is closed is joined as written', () => {
    const earlier = '{"statement": "Pay.", ';

    expect(joinContinuation(earlier, 'Sure, here is the rest: "b": 1}')).toBe(
      `${earlier}Sure, here is the rest: "b": 1}`,
    );
  });

  it('RF-604 a quote inside a string is not read as the start of a key', () => {
    const earlier = '{"a": "x, \\"b';

    expect(joinContinuation(earlier, ' c d"}')).toBe(`${earlier} c d"}`);
  });

  it('RF-604 a list item string that is cut takes white space like a value', () => {
    expect(joinContinuation('{"tags": ["red", "dark', ' blue"]}')).toBe(
      '{"tags": ["red", "dark blue"]}',
    );
  });
});

describe('joinContinuation: a repeat of the cut (P3-31)', () => {
  it('RF-604 a real continuation that starts with 12 or more characters of the cut loses none', () => {
    const earlier = `{"statement": "${'a'.repeat(20)}`;
    const fragment = `${'a'.repeat(20)}b"}`;

    expect(joinContinuation(earlier, fragment)).toBe(`${earlier}${fragment}`);
  });

  it('RF-604 a repeat with a short period is also a continuation', () => {
    const earlier = `{"statement": "${'ab'.repeat(10)}`;
    const fragment = `${'ab'.repeat(8)}c"}`;

    expect(joinContinuation(earlier, fragment)).toBe(`${earlier}${fragment}`);
  });

  it('RF-604 a repeat of natural text is still dropped once', () => {
    const earlier = '{"statement": "Pay the order before the';
    const fragment = 'Pay the order before the end of day."}';

    expect(joinContinuation(earlier, fragment)).toBe(
      '{"statement": "Pay the order before the end of day."}',
    );
  });
});

describe('endsCutOff', () => {
  const end = { finishReason: 'stop', outputTokens: 5 } as const;

  it('RF-007 a continued answer that stops with JSON still open is cut off', () => {
    expect(endsCutOff('{"a": [1,', end, limit, 1)).toBe(true);
  });

  it('RF-007 an answer that was never continued keeps the meaning of isCutOff', () => {
    expect(endsCutOff('{"a": [1,', end, limit, 0)).toBe(false);
    expect(endsCutOff('{"a": [1,', { finishReason: 'length', outputTokens: 5 }, limit, 0)).toBe(
      true,
    );
  });

  it('RF-007 a continued answer with closed JSON is complete', () => {
    expect(endsCutOff('{"a": [1]}', end, limit, 2)).toBe(false);
  });
});

describe('cutOffMessage', () => {
  it('RF-007 names the token count and the setting', () => {
    expect(cutOffMessage(4096)).toBe(
      'The planner answer was cut off at 4096 output tokens; raise Planner max output tokens in Project settings.',
    );
  });
});
