import { describe, expect, it } from 'vitest';
import { keepLegacyDefault, legacySafe } from '../../../../src/domain/planning/legacy-default.js';

// RF-631, DEC-80, DEC-135: an open question takes a default (DEC-80), and a default may not change
// what users see today; the question says so and the default keeps the legacy behaviour.

const question = { id: 'prd.rules', question: 'Which rules stay?', answer: 'None.' };

describe('legacySafe', () => {
  it('RF-631 leaves a default that keeps the legacy behaviour as it is', () => {
    expect(legacySafe(question)).toBe(question);
    expect(legacySafe({ ...question, changesLegacy: false })).toEqual({
      ...question,
      changesLegacy: false,
    });
  });

  it('RF-631 replaces a default that would change what users see today', () => {
    const refused = legacySafe({
      ...question,
      answer: 'Free shipping is dropped.',
      changesLegacy: true,
    });

    expect(refused.answer).toContain(keepLegacyDefault);
    expect(refused.answer).not.toBe('Free shipping is dropped.');
  });

  it('RF-631 says in the question that the proposed default was not allowed', () => {
    const refused = legacySafe({
      ...question,
      answer: 'Free shipping is dropped.',
      changesLegacy: true,
    });

    expect(refused.answer).toContain('would change what users see today');
    expect(refused.answer).toContain('not allowed');
    expect(refused.id).toBe('prd.rules');
    expect(refused.question).toBe('Which rules stay?');
  });

  it('RF-631 returns a question whose default is now allowed, so it is checked once', () => {
    const refused = legacySafe({ ...question, changesLegacy: true });

    expect(legacySafe(refused)).toEqual(refused);
    expect(refused.changesLegacy).toBe(false);
  });
});
