import { describe, expect, it } from 'vitest';
import {
  dependenciesOf,
  type OrderedCard,
} from '../../../../src/domain/planning/parallel-cards.js';

// RF-634: file lists are paths, patterns and spellings; whatever the planner wrote, cards that can
// touch the same file are ordered.

function card(files: readonly string[]): OrderedCard {
  return { phase: 1, files, declared: [] };
}

describe('dependenciesOf: patterns', () => {
  const file = 'src/a.ts';

  it.each([
    'src/**',
    'src/*.ts',
    'src/{a,b}.ts',
    'src/[ab].ts',
    'src/?.ts',
    '**/x.ts',
    'src/*/z.ts',
  ])('RF-634 the pattern %j overlaps src/a.ts, in both directions', (pattern) => {
    expect(dependenciesOf([card([file]), card([pattern])])).toEqual([[], [0]]);
    expect(dependenciesOf([card([pattern]), card([file])])).toEqual([[], [0]]);
  });

  it('RF-634 a pattern does not reach beyond the folder before it', () => {
    expect(dependenciesOf([card(['src/*.ts']), card(['tests/a.ts'])])).toEqual([[], []]);
  });

  it('RF-634 a leading ** is the root of the repository', () => {
    expect(dependenciesOf([card(['docs/y.md']), card(['**/x.ts'])])).toEqual([[], [0]]);
  });
});

describe('dependenciesOf: other spellings of one file', () => {
  it.each([
    ['canonical and precomposed accents', 'e\u0301.ts', '\u00e9.ts'],
    ['full-width letters', '\uff53\uff52\uff43/a.ts', 'src/a.ts'],
    ['a trailing dot on a folder', 'src./a.ts', 'src/a.ts'],
    ['trailing dots and spaces on a file', 'src/a.ts. .', 'src/a.ts'],
    ['an alternate data stream', 'src/a.ts::$DATA', 'src/a.ts'],
    ['a drive path (the root of the repository)', 'C:\\repo\\src\\a.ts', 'docs/b.md'],
    ['a home path (the root of the repository)', '~/src/a.ts', 'docs/b.md'],
  ])('RF-634 %s are treated as overlapping', (_, left, right) => {
    expect(dependenciesOf([card([left]), card([right])])).toEqual([[], [0]]);
  });
});
