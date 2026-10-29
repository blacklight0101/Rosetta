import { describe, expect, it } from 'vitest';
import {
  parseBriefAnswers,
  parsePlanningBrief,
} from '../../../../src/application/planning/planning-brief-schema.js';
import { briefDecisions } from '../../../../src/domain/planning/brief-decisions.js';
import { defaultedQuestions } from '../../../../src/domain/planning/brief-questions.js';
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
// DEC-184: a typed answer reaches the planner, so the question leaves `defaulted` and the decision
// states the owner's answer.
const typedIds = ['architecture', 'migration', 'buildMethod'];
const typedAll = {
  chosen: { architecture: 'typed', migration: 'typed', buildMethod: 'typed' },
  typed: {
    architecture: 'Cells, one per region.',
    migration: 'Move one module a week.',
    buildMethod: 'A vendor builds it.',
  },
};

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

describe('a typed answer that reaches the planner', () => {
  it('RF-645 DEC-184 a typed answer takes the question out of defaulted and keeps the typed text', () => {
    const brief = buildBrief(typedAll, shippedCatalogue);

    for (const id of typedIds) expect(brief.defaulted).not.toContain(id);
    expect(brief.typed).toEqual(typedAll.typed);
  });

  it('RF-645 DEC-184 the enumerated values keep their defaults and the other questions stay defaulted', () => {
    const brief = buildBrief(typedAll, shippedCatalogue);

    expect(brief.architecture.style).toBe(buildBrief({}, shippedCatalogue).architecture.style);
    expect(brief.migration).toBe(buildBrief({}, shippedCatalogue).migration);
    expect(brief.defaulted).toContain('stack.database');
    expect(brief.defaulted).toContain('context.teamSize');
  });

  it('RF-645 DEC-184 a question with no typed answer behaves exactly as before', () => {
    const before = buildBrief({ chosen: { migration: 'typed' } }, shippedCatalogue);

    expect(before.defaulted).toEqual(buildBrief({}, shippedCatalogue).defaulted);
    expect(before.defaulted).toEqual(expect.arrayContaining(typedIds));
  });

  it('RF-645 DEC-184 a text of spaces only does not answer the question', () => {
    const brief = buildBrief({ typed: { migration: '   ' } }, shippedCatalogue);

    expect(brief.defaulted).toContain('migration');
  });
});

describe('a typed principle', () => {
  it('RF-605 RF-645 a typed principle takes principles out of defaulted; ticked principles are still sent', () => {
    const brief = buildBrief(
      { principles: ['kiss', 'tdd'], typed: { principles: 'Pair on security.' } },
      shippedCatalogue,
    );

    expect(brief.defaulted).not.toContain('principles');
    expect(brief.principles).toEqual(['kiss', 'tdd']);
    expect(brief.typed).toEqual({ principles: 'Pair on security.' });
  });

  it('RF-605 RF-645 a typed principle alone leaves the ticked list at the catalogue default', () => {
    const brief = buildBrief({ typed: { principles: 'Pair on security.' } }, shippedCatalogue);

    expect(brief.defaulted).not.toContain('principles');
    expect(brief.principles).toEqual(buildBrief({}, shippedCatalogue).principles);
  });
});

describe('a typed answer in the decisions and the questions', () => {
  it('RF-645 DEC-184 the architecture and migration decisions state the owner answer and are Accepted', () => {
    const brief = { ...buildBrief(typedAll, shippedCatalogue), savedAt: stamp };
    const evidence = { supported: new Set<string>(), cards: [], tasks: [] };

    const { decisions } = briefDecisions(brief, shippedCatalogue, evidence, 0);

    const style = decisions.find((decision) => decision.title.startsWith('Architecture style'));
    const migration = decisions.find((decision) => decision.title.startsWith('Migration'));
    expect(style?.status).toBe('Accepted');
    expect(style?.decision).toContain('Cells, one per region.');
    expect(style?.decision).not.toContain('this is the default');
    expect(migration?.status).toBe('Accepted');
    expect(migration?.decision).toContain('Move one module a week.');
    expect(migration?.decision).not.toContain('this is the default');
  });

  it('RF-645 DEC-184 an answered question is no longer listed as an open question', () => {
    const brief = { ...buildBrief(typedAll, shippedCatalogue), savedAt: stamp };

    const open = defaultedQuestions(brief, shippedCatalogue).map((question) => question.id);

    for (const id of typedIds) expect(open).not.toContain(id);
  });

  it('RF-645 DEC-184 a brief saved before the change keeps the question defaulted and its decision Proposed', () => {
    const older = {
      ...buildBrief(typedAll, shippedCatalogue),
      defaulted: [...typedIds, 'stack.database'],
      savedAt: stamp,
    };
    const evidence = { supported: new Set<string>(), cards: [], tasks: [] };

    const { decisions } = briefDecisions(older, shippedCatalogue, evidence, 0);

    const style = decisions.find((decision) => decision.title.startsWith('Architecture style'));
    expect(style?.status).toBe('Proposed');
    expect(style?.decision).not.toContain('Cells, one per region.');
    expect(defaultedQuestions(older, shippedCatalogue).map((each) => each.id)).toEqual(
      expect.arrayContaining(typedIds),
    );
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
