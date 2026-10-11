import { describe, expect, it } from 'vitest';
import type { CommitSha } from '../../../../src/domain/sources/commit-sha.js';
import { buildPermalink } from '../../../../src/domain/sources/permalink.js';

const commitSha: CommitSha = { value: '3f786850e387550fdab836ed7e6dc881de23001b' };
const base = { owner: 'Octo', repo: 'Demo', commitSha };

describe('buildPermalink', () => {
  it('RF-125 links a citation to the exact lines on GitHub at the pinned commit', () => {
    const link = buildPermalink({
      ...base,
      path: 'src/Web/Default.aspx.cs',
      startLine: 10,
      endLine: 24,
    });

    expect(link).toEqual({
      ok: true,
      value:
        'https://github.com/Octo/Demo/blob/3f786850e387550fdab836ed7e6dc881de23001b/src/Web/Default.aspx.cs#L10-L24',
    });
  });

  it('RF-125 links a single line as L<a>-L<a>', () => {
    const link = buildPermalink({ ...base, path: 'README.md', startLine: 3, endLine: 3 });

    expect(link).toEqual({
      ok: true,
      value:
        'https://github.com/Octo/Demo/blob/3f786850e387550fdab836ed7e6dc881de23001b/README.md#L3-L3',
    });
  });

  it('RF-125 percent-encodes characters that are not valid in a URL path segment', () => {
    const link = buildPermalink({ ...base, path: 'docs/My Notes#1.md', startLine: 1, endLine: 2 });

    expect(link).toEqual({
      ok: true,
      value:
        'https://github.com/Octo/Demo/blob/3f786850e387550fdab836ed7e6dc881de23001b/docs/My%20Notes%231.md#L1-L2',
    });
  });

  it.each([
    ['an absolute path', '/etc/passwd'],
    ['a path with a backslash', 'src\\Web\\Default.aspx'],
    ['a path that climbs up', 'src/../../secret'],
    ['an empty path', ''],
    ['a path with an empty segment', 'src//Web'],
  ])('RF-125 refuses %s', (_name, path) => {
    expect(buildPermalink({ ...base, path, startLine: 1, endLine: 1 })).toEqual({
      ok: false,
      error: 'invalid-path',
    });
  });

  it.each([
    ['a start line before 1', 0, 1],
    ['an end line before the start line', 5, 4],
    ['a fractional line', 1.5, 2],
  ])('RF-125 refuses %s', (_name, startLine, endLine) => {
    expect(buildPermalink({ ...base, path: 'a.cs', startLine, endLine })).toEqual({
      ok: false,
      error: 'invalid-lines',
    });
  });
});
