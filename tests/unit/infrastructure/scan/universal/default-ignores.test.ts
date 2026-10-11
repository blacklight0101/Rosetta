import { describe, expect, it } from 'vitest';
import { isDefaultIgnored } from '../../../../../src/infrastructure/scan/universal/default-ignores.js';

describe('default ignores', () => {
  it.each([
    '.git/config',
    'src/.svn/entries',
    '.hg/store',
    'bin/Debug/App.txt',
    'src/Web/bin/App.txt',
    'obj/project.assets.json',
    'node_modules/left-pad/index.js',
    'web/node_modules/x/y.js',
    'packages/Newtonsoft.Json/lib/readme.txt',
    'BIN/Release/a.txt',
    'Obj/a.txt',
  ])('RF-100 ignores %s because a folder on the way is build output or version control', (path) => {
    expect(isDefaultIgnored(path)).toBe(true);
  });

  it.each([
    'logo.png',
    'assets/Photo.JPG',
    'lib/Shop.dll',
    'tools/setup.exe',
    'dist/app.zip',
    'docs/manual.pdf',
    'fonts/a.woff2',
    'db/Shop.mdf',
  ])('RF-100 ignores the binary file %s by its extension', (path) => {
    expect(isDefaultIgnored(path)).toBe(true);
  });

  it.each([
    'src/main.cs',
    'src/binary.txt',
    'src/obj.cs',
    'src/bin',
    '.gitignore',
    '.github/workflows/ci.yml',
    'docs/node_modules.md',
    'image.svg',
  ])('RF-100 keeps %s', (path) => {
    expect(isDefaultIgnored(path)).toBe(false);
  });

  it('RF-124 folders above the subpath do not count, folders below it do', () => {
    expect(isDefaultIgnored('packages/app/src/a.cs', 'packages/app')).toBe(false);
    expect(isDefaultIgnored('packages/app/node_modules/x.js', 'packages/app')).toBe(true);
    expect(isDefaultIgnored('packages/app/src/a.cs', 'packages')).toBe(false);
    expect(isDefaultIgnored('packages/app/src/a.cs', '')).toBe(true);
  });
});
