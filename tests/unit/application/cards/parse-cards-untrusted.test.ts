import { describe, expect, it } from 'vitest';
import { cardLimits } from '../../../../src/application/cards/card-limits.js';
import { parseCardOutput } from '../../../../src/application/cards/parse-cards.js';
import { cardObject, cardsJson, problemPaths, problemsOf } from '../../../support/card-output.js';

describe('parseCardOutput treats model output as untrusted', () => {
  it('RF-202 a __proto__ key does not pollute any object', () => {
    const raw = cardsJson().replace('{"cards"', '{"__proto__":{"polluted":true},"cards"');

    const parsed = parseCardOutput(raw);

    expect(parsed.ok).toBe(true);
    expect(Reflect.get({}, 'polluted')).toBeUndefined();
    expect(parsed.ok && Reflect.get(parsed.value, 'polluted')).toBeUndefined();
  });

  it('RF-202 an unknown field on a card does not reach the draft', () => {
    const parsed = parseCardOutput(cardsJson({ constructor: { prototype: { x: 1 } }, extra: 'y' }));

    expect(parsed.ok && Object.keys(parsed.value[0] ?? {}).sort()).toEqual([
      'area',
      'claims',
      'confidence',
      'summary',
      'title',
      'type',
    ]);
  });
});

describe('parseCardOutput bounds what it reads', () => {
  it('RF-202 output larger than the limit is refused without being parsed', () => {
    const raw = ' '.repeat(cardLimits.maxOutputChars + 1);

    expect(problemsOf(raw)[0]?.message).toMatch(/larger/i);
  });

  it('RF-202 more cards than the limit are refused', () => {
    const cards = Array.from({ length: cardLimits.maxCards + 1 }, () => cardObject());

    expect(problemsOf(JSON.stringify({ cards })).length).toBeGreaterThan(0);
  });

  it('RF-202 a very long text field is refused', () => {
    const summary = 'x'.repeat(cardLimits.maxSummaryChars + 1);

    expect(problemPaths(cardsJson({ summary }))).toContain('cards.0.summary');
  });

  it('RF-202 many unmatched braces are scanned in bounded time', () => {
    const started = performance.now();

    const problems = problemsOf('{'.repeat(100_000));

    expect(problems).toHaveLength(1);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('RF-202 reports only the first problems of a huge answer', () => {
    const claims = Array.from({ length: 40 }, () => ({ text: '', citations: [] }));

    expect(problemsOf(cardsJson({ claims })).length).toBeLessThanOrEqual(cardLimits.maxProblems);
  });
});
