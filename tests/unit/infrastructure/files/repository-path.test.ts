import { describe, expect, it } from 'vitest';
import { checkRepositoryPath } from '../../../../src/infrastructure/files/repository-path.js';

describe('repository path check', () => {
  it.each([
    'README.md',
    'src/app/main.ts',
    'Web.config',
    'docs/a b/c.txt',
    'café/x.md',
    '.github/x.yml',
  ])('RF-140 accepts the plain relative path %s unchanged', (path) => {
    expect(checkRepositoryPath(path)).toEqual({ ok: true, value: path });
  });
});

describe('repository path check against traversal', () => {
  it.each([
    '../outside.txt',
    'src/../../outside.txt',
    'a/b/../../../c',
    '/etc/passwd',
    '\\\\server\\share\\x',
    'C:/Windows/win.ini',
    'c:secret.txt',
    '..\\..\\outside.txt',
    '\uFF0E\uFF0E/outside.txt',
    'src\uFF0F..\uFF0Fx',
  ])('RF-140 refuses %s as outside the root', (path) => {
    expect(checkRepositoryPath(path)).toEqual({ ok: false, error: 'outside-root' });
  });
});

describe('repository path check against invalid names', () => {
  it.each([
    '',
    './README.md',
    'src//main.ts',
    'src/',
    'src/./main.ts',
    'src\\main.ts',
    'CON',
    'con.txt',
    'src/NUL',
    'src/nul.tar.gz',
    'COM1.log',
    'lpt9',
    'COM\u00B9',
    'CONIN$',
    'AUX ',
    'notes.txt:secret',
    '.env.',
    'secret.key ',
    'a\u0000b',
    'line\nbreak',
    'what?.txt',
    'a*b',
    'x<y',
    'pipe|name',
    'quote"name',
  ])('RF-140 refuses %j as an invalid path', (path) => {
    expect(checkRepositoryPath(path)).toEqual({ ok: false, error: 'invalid-path' });
  });
});
