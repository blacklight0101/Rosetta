import { describe, expect, it } from 'vitest';
import {
  parseBriefAnswers,
  parsePlanningBrief,
} from '../../../../src/application/planning/planning-brief-schema.js';
import {
  briefProblems,
  buildBrief,
  sameBrief,
} from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-645, RF-605, DEC-178, data-model.md section 3.20: the brief keeps which option answered each
// question (`chosen`) and the text of a typed answer (`typed`). Both are additive: a brief saved
// before them still reads, and a save without them is valid.

const stamp = '2026-10-28T10:00:00.000Z';
const own = { chosen: { migration: 'typed' }, typed: { migration: 'Move one module a week.' } };

describe('the brief with chosen options and typed answers', () => {
  it('RF-645 a brief saved before chosen and typed existed still parses and has neither', () => {
    const older = { ...buildBrief({}, shippedCatalogue), savedAt: stamp };

    const read = parsePlanningBrief(JSON.parse(JSON.stringify(older)));

    expect(read).toEqual(older);
    expect(read).not.toHaveProperty('chosen');
    expect(read).not.toHaveProperty('typed');
  });

  it('RF-645 a typed answer and the option chosen are saved in the brief and read back equal', () => {
    const answers = parseBriefAnswers({ ...own, stack: [] });
    expect(answers).toBeDefined();
    if (answers === undefined) return;

    const brief = { ...buildBrief(answers, shippedCatalogue), savedAt: stamp };

    expect(brief.chosen).toEqual(own.chosen);
    expect(brief.typed).toEqual(own.typed);
    expect(parsePlanningBrief(JSON.parse(JSON.stringify(brief)))).toEqual(brief);
  });

  it('RF-645 a question answered by typing is no longer listed as defaulted', () => {
    const brief = buildBrief(own, shippedCatalogue);

    expect(brief.defaulted).not.toContain('migration');
    expect(brief.defaulted).toContain('architecture');
  });

  it('RF-645 changing the option chosen is a change of the brief', () => {
    const left = buildBrief({ chosen: { migration: 'parallel-change' } }, shippedCatalogue);
    const right = buildBrief({ chosen: { migration: 'rewrite' } }, shippedCatalogue);

    expect(sameBrief(left, right)).toBe(false);
    expect(
      sameBrief(left, buildBrief({ chosen: { migration: 'parallel-change' } }, shippedCatalogue)),
    ).toBe(true);
  });

  it('RF-645 the keys of chosen and typed are written in a fixed order', () => {
    const brief = buildBrief(
      { chosen: { migration: 'typed', architecture: 'clean' }, typed: { migration: 'x' } },
      shippedCatalogue,
    );

    expect(Object.keys(brief.chosen ?? {})).toEqual(['architecture', 'migration']);
  });
});

describe('a save with chosen options and typed answers', () => {
  it.each([
    ['a typed text over 500 characters', { typed: { migration: 'x'.repeat(501) } }],
    ['an empty typed text', { typed: { migration: '  ' } }],
    ['an empty chosen option', { chosen: { migration: '' } }],
    ['a chosen option over 80 characters', { chosen: { migration: 'x'.repeat(81) } }],
    [
      'more than 40 chosen questions',
      {
        chosen: Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`q${String(i)}`, 'a'])),
      },
    ],
  ])('RF-645 refuses %s', (_name, body) => {
    expect(parseBriefAnswers(body)).toBeUndefined();
  });

  it('RF-645 refuses a typed answer for a question that has no typed text', () => {
    const problems = briefProblems({ typed: { 'stack.database': 'Oracle' } }, shippedCatalogue);

    expect(problems.map((problem) => problem.field)).toEqual(['typed.stack.database']);
  });
});
