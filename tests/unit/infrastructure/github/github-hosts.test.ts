import { describe, expect, it } from 'vitest';
import { checkGitHubUrl } from '../../../../src/infrastructure/github/github-hosts.js';

describe('checkGitHubUrl', () => {
  it.each([
    'https://api.github.com/repos/Octo/Demo',
    'https://codeload.github.com/Octo/Demo/legacy.tar.gz/main',
    'https://github.com/Octo/Demo',
  ])('RF-127 allows %s', (url) => {
    expect(checkGitHubUrl(new URL(url))).toBeUndefined();
  });

  it.each([
    ['http instead of https', 'http://api.github.com/repos/Octo/Demo'],
    ['another host', 'https://example.com/repos/Octo/Demo'],
    ['a GitHub subdomain outside the list', 'https://raw.githubusercontent.com/Octo/Demo'],
    ['a look-alike host', 'https://api.github.com.example.net/repos/Octo/Demo'],
    ['credentials in the URL', 'https://token@api.github.com/repos/Octo/Demo'],
    ['an explicit port', 'https://api.github.com:8443/repos/Octo/Demo'],
  ])('RF-127 refuses %s with RST-1904', (_name, url) => {
    expect(checkGitHubUrl(new URL(url))).toMatchObject({ code: 'RST-1904' });
  });
});
