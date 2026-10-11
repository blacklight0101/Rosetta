import { describe, expect, it } from 'vitest';
import { parseCommitSha } from '../../../../src/domain/sources/commit-sha.js';
import {
  parseGitHubUrl,
  repositoryUrl,
  snapshotKey,
} from '../../../../src/domain/sources/github-repo-ref.js';

const sha = '3f786850e387550fdab836ed7e6dc881de23001b';

describe('parseGitHubUrl', () => {
  it('RF-120 records owner and repo from a bare repository URL', () => {
    expect(parseGitHubUrl('https://github.com/Octo/Demo')).toEqual({
      ok: true,
      value: { owner: 'Octo', repo: 'Demo', ref: undefined, subpath: undefined },
    });
  });

  it('RF-120 records the ref of /tree/<ref>', () => {
    expect(parseGitHubUrl('https://github.com/Octo/Demo/tree/v1.2')).toEqual({
      ok: true,
      value: { owner: 'Octo', repo: 'Demo', ref: 'v1.2', subpath: undefined },
    });
  });

  it('RF-120 records the subpath of /tree/<ref>/<subpath> with forward slashes', () => {
    expect(parseGitHubUrl('https://github.com/Octo/Demo/tree/main/src/Web/')).toEqual({
      ok: true,
      value: { owner: 'Octo', repo: 'Demo', ref: 'main', subpath: 'src/Web' },
    });
  });

  it('RF-120 resolves dot segments like a browser, so a subpath can never climb up', () => {
    expect(parseGitHubUrl('https://github.com/Octo/Demo/tree/main/src/%2E%2E/lib/../lib')).toEqual({
      ok: true,
      value: { owner: 'Octo', repo: 'Demo', ref: 'main', subpath: 'lib' },
    });
  });

  it('RF-120 decodes percent-encoded segments', () => {
    expect(parseGitHubUrl('https://github.com/Octo/Demo/tree/release%2F1/My%20Folder')).toEqual({
      ok: true,
      value: { owner: 'Octo', repo: 'Demo', ref: 'release/1', subpath: 'My Folder' },
    });
  });

  it.each([
    ['surrounding whitespace', '  https://github.com/Octo/Demo  '],
    ['a trailing slash', 'https://github.com/Octo/Demo/'],
    ['a .git suffix', 'https://github.com/Octo/Demo.git'],
    ['an upper-case scheme and host', 'HTTPS://GitHub.COM/Octo/Demo'],
    ['a query string and a fragment', 'https://github.com/Octo/Demo?tab=readme#readme'],
  ])('RF-120 normalises %s', (_name, input) => {
    expect(parseGitHubUrl(input)).toEqual({
      ok: true,
      value: { owner: 'Octo', repo: 'Demo', ref: undefined, subpath: undefined },
    });
  });
});

describe('parseGitHubUrl refusals', () => {
  it.each([
    ['not a URL', 'octo/demo', 'not-a-url'],
    ['an http URL', 'http://github.com/Octo/Demo', 'not-https'],
    ['another host', 'https://gitlab.com/Octo/Demo', 'not-github'],
    ['a GitHub subdomain', 'https://raw.githubusercontent.com/Octo/Demo', 'not-github'],
    ['a look-alike host', 'https://github.com.example.net/Octo/Demo', 'not-github'],
    ['credentials in the URL', 'https://user:secret@github.com/Octo/Demo', 'not-github'],
    ['a missing repository', 'https://github.com/Octo', 'missing-repository'],
    ['an owner starting with a hyphen', 'https://github.com/-Octo/Demo', 'invalid-name'],
    ['a file URL', 'https://github.com/Octo/Demo/blob/main/README.md', 'invalid-ref'],
    ['/tree without a ref', 'https://github.com/Octo/Demo/tree', 'invalid-ref'],
    [
      'a subpath with a backslash',
      'https://github.com/Octo/Demo/tree/main/src%5Cweb',
      'invalid-subpath',
    ],
  ])('RF-120 refuses %s', (_name, input, problem) => {
    expect(parseGitHubUrl(input)).toEqual({ ok: false, error: problem });
  });
});

describe('repositoryUrl and snapshotKey', () => {
  it('RF-120 builds the canonical repository URL', () => {
    expect(repositoryUrl({ owner: 'Octo', repo: 'Demo' })).toBe('https://github.com/Octo/Demo');
  });

  it('RF-122 names the snapshot folder <owner>__<repo>@<sha> in lower case', () => {
    const commit = parseCommitSha(sha);
    if (!commit.ok) throw new Error('fixture sha must parse');

    expect(snapshotKey({ owner: 'Octo', repo: 'Demo' }, commit.value)).toBe(`octo__demo@${sha}`);
  });
});
