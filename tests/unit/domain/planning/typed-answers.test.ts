import { describe, expect, it } from 'vitest';
import {
  referenceTitle,
  typedAnswers,
  typedText,
} from '../../../../src/domain/planning/typed-answers.js';

// RF-605, RF-645, ADR-013, DEC-184: which typed answers of a brief reach the planner and the package.
// A typed answer counts only when its question left `defaulted`, so a brief saved before the typed
// answers reached the planner keeps its older behaviour.

describe('typedText', () => {
  it('RF-645 collapses line breaks and runs of spaces into one line and trims it', () => {
    expect(typedText('  Move one\n\n module\t a   week.  ')).toBe('Move one module a week.');
  });

  it('RF-645 turns control characters into spaces', () => {
    expect(typedText('a\u0000b\u001bc')).toBe('a b c');
  });

  it('ADR-013 strips C1 controls and bidi override and isolate characters', () => {
    const c1 = 'a\u0080b\u0085c\u009fd';
    const bidi = 'e‪e‫f‬g‭h‮i⁦j⁧k⁨l⁩m';

    expect(typedText(c1)).toBe('a b c d');
    expect(typedText(bidi)).toBe('e e f g h i j k l m');
    expect(typedText('‮evil⁩')).toBe('evil');
  });

  it('RF-645 an empty or missing text is the empty text', () => {
    expect(typedText(undefined)).toBe('');
    expect(typedText(' \n ')).toBe('');
  });
});

describe('typedAnswers', () => {
  const typed = {
    principles: 'Always pair on security changes.',
    architecture: 'Cells, one per region.',
    migration: 'Move one module a week.',
    buildMethod: 'A vendor builds it.',
  };

  it('RF-645 DEC-184 returns the typed text of each of the four questions that left defaulted', () => {
    expect(typedAnswers({ defaulted: ['stack.database'], typed })).toEqual(typed);
  });

  it('RF-645 DEC-184 a question still in defaulted passes no text (a brief saved before the change)', () => {
    const answers = typedAnswers({ defaulted: ['architecture', 'migration'], typed });

    expect(answers).toEqual({
      principles: typed.principles,
      buildMethod: typed.buildMethod,
    });
  });

  it('RF-645 a text of another question and an empty text are ignored', () => {
    const answers = typedAnswers({
      defaulted: [],
      typed: { 'stack.database': 'Oracle', migration: '   ' },
    });

    expect(answers).toEqual({});
  });

  it('RF-645 a brief with no typed text has no typed answer', () => {
    expect(typedAnswers({ defaulted: [] })).toEqual({});
  });
});

describe('referenceTitle', () => {
  it('RF-608 DEC-184 with a typed architecture the style is named as the reference of the dependency check', () => {
    const brief = { defaulted: [], typed: { architecture: 'Cells, one per region.' } };

    expect(referenceTitle(brief, 'architecture', 'Layered (N-tier)')).toBe(
      "Layered (N-tier) (the default style, the reference Rosetta's dependency check uses)",
    );
  });

  it('RF-610 DEC-184 with a typed migration the strategy is named as the reference of the strategy-fit check', () => {
    const brief = { defaulted: [], typed: { migration: 'One module a week.' } };

    expect(referenceTitle(brief, 'migration', 'Strangler Fig')).toBe(
      "Strangler Fig (the default strategy, the reference Rosetta's strategy-fit check uses)",
    );
  });

  it('RF-608 without a typed answer the title is unchanged', () => {
    expect(referenceTitle({ defaulted: [] }, 'architecture', 'Layered (N-tier)')).toBe(
      'Layered (N-tier)',
    );
  });
});
