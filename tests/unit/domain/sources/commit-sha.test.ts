import { describe, expect, it } from 'vitest';
import { parseCommitSha } from '../../../../src/domain/sources/commit-sha.js';

const sha = '3f786850e387550fdab836ed7e6dc881de23001b';

describe('parseCommitSha', () => {
  it('RF-121 accepts a full 40-character hexadecimal SHA', () => {
    expect(parseCommitSha(sha)).toEqual({ ok: true, value: { value: sha } });
  });

  it('RF-121 lower-cases an upper-case SHA', () => {
    expect(parseCommitSha(sha.toUpperCase())).toEqual({ ok: true, value: { value: sha } });
  });

  it.each([
    ['a short SHA', sha.slice(0, 7)],
    ['a branch name', 'main'],
    ['a SHA with a non-hex character', `${sha.slice(0, 39)}g`],
    ['an empty string', ''],
    ['a SHA with surrounding whitespace', ` ${sha} `],
  ])('RF-121 refuses %s', (_name, input) => {
    expect(parseCommitSha(input)).toEqual({ ok: false, error: 'invalid-commit-sha' });
  });
});
