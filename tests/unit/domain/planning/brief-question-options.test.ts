import { describe, expect, it } from 'vitest';
import { briefQuestionOptions } from '../../../../src/domain/planning/brief-question-options.js';
import { buildBrief, type PlanningBrief } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-637, RF-645, DEC-184, DEC-189: the Plan setup options of every brief question that took its
// default, at least three each, the default marked recommended; the build method has none marked.

const brief: PlanningBrief = {
  ...buildBrief({}, shippedCatalogue),
  savedAt: '2026-10-29T09:30:00.000Z',
};

const options = briefQuestionOptions(brief, shippedCatalogue);
const of = (id: string): readonly { answer: string; recommended: boolean }[] => options[id] ?? [];

describe('briefQuestionOptions', () => {
  it('RF-645 every defaulted question has at least three options', () => {
    expect(Object.keys(options)).toEqual(brief.defaulted);
    for (const list of Object.values(options)) {
      expect(list.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('RF-645 DEC-184 the build method has no recommended option', () => {
    const method = of('buildMethod');

    expect(method).toHaveLength(3);
    expect(method.some((option) => option.recommended)).toBe(false);
  });

  it('RF-645 each question marks its default recommended; a stack layer with no proposal marks none', () => {
    const marked = (id: string): number => of(id).filter((option) => option.recommended).length;
    const others = Object.keys(options).filter(
      (id) => id !== 'buildMethod' && id !== 'principles' && !id.startsWith('stack.'),
    );

    expect(others.map(marked)).toEqual(others.map(() => 1));
    expect(marked('principles')).toBeGreaterThan(0);
    expect(marked('stack.database')).toBe(0);
    expect(of('migration').find((o) => o.recommended)?.answer).toBe('Strangler Fig');
    expect(of('architecture').find((o) => o.recommended)?.answer).toBe('Layered (N-tier)');
  });

  it('RF-645 a stack layer offers the legacy technology as an option', () => {
    expect(of('stack.database').map((option) => option.answer)).toContain(
      'Keep the legacy technology',
    );
  });
});
