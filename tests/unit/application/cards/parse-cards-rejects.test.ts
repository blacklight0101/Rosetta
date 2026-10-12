import { describe, expect, it } from 'vitest';
import { cardsJson, problemPaths, problemsOf } from '../../../support/card-output.js';

describe('parseCardOutput rejects invalid cards with located problems', () => {
  it('RF-202 a claim without a citation is rejected', () => {
    const claims = [{ text: 'x', citations: [] }];

    expect(problemPaths(cardsJson({ claims }))).toContain('cards.0.claims.0.citations');
  });

  it('RF-202 a card without claims is rejected', () => {
    expect(problemPaths(cardsJson({ claims: [] }))).toContain('cards.0.claims');
  });

  it('RF-202 a citation that is not path:start-end is rejected with its position', () => {
    const claims = [{ text: 'x', citations: ['src/a.cs line 4'] }];

    expect(problemPaths(cardsJson({ claims }))).toContain('cards.0.claims.0.citations.0');
  });

  it('RF-202 a citation with its end line before its start line is rejected', () => {
    const claims = [{ text: 'x', citations: ['src/a.cs:9-3'] }];

    expect(problemsOf(cardsJson({ claims })).length).toBeGreaterThan(0);
  });

  it('RF-202 a citation path that climbs out of the repository is rejected', () => {
    const claims = [{ text: 'x', citations: ['../secret.txt:1-2'] }];

    expect(problemPaths(cardsJson({ claims }))).toContain('cards.0.claims.0.citations.0');
  });
});

describe('parseCardOutput rejects missing or unknown fields', () => {
  it.each([
    ['an unknown type', { type: 'RULE' }, 'cards.0.type'],
    ['an unknown confidence', { confidence: 'Sure' }, 'cards.0.confidence'],
    ['a missing title', { title: '' }, 'cards.0.title'],
    ['a missing area', { area: undefined }, 'cards.0.area'],
    ['a missing summary', { summary: undefined }, 'cards.0.summary'],
    ['an OQ without a question', { type: 'OQ', whyItMatters: 'w' }, 'cards.0.question'],
    ['an OQ without why it matters', { type: 'OQ', question: 'q' }, 'cards.0.whyItMatters'],
  ])('RF-202 %s is rejected', (_name, overrides, path) => {
    expect(problemPaths(cardsJson(overrides))).toContain(path);
  });
});

describe('parseCardOutput rejects answers that are not cards', () => {
  it('RF-202 text that holds no JSON is rejected with one problem', () => {
    const problems = problemsOf('I could not find anything in this area.');

    expect(problems).toHaveLength(1);
    expect(problems[0]?.path).toBe('');
    expect(problems[0]?.message).toContain('JSON');
  });

  it('RF-202 JSON of the wrong shape is rejected', () => {
    expect(problemsOf('{"findings": []}').length).toBeGreaterThan(0);
  });

  it('RF-202 an empty card list inside a wrong object is not taken for an answer', () => {
    expect(problemsOf('{"findings": [], "notes": {"cards": 3}}').length).toBeGreaterThan(0);
  });

  it('RF-202 a stray [] in prose is not read as zero cards: an empty answer needs the cards key', () => {
    expect(problemsOf('Nothing to report here [] for this area.').length).toBeGreaterThan(0);
    expect(problemsOf('```json\n[]\n```').length).toBeGreaterThan(0);
  });
});
