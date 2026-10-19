import { describe, expect, it } from 'vitest';
import {
  hasUnwritableSegment,
  isInLeftOutFolder,
  isUnsafePath,
  LimitCounter,
  splitPath,
} from '../../../../src/infrastructure/sources/entry-guards.js';

describe('splitPath', () => {
  it('RF-129 splits on slashes and backslashes alike', () => {
    expect(splitPath('a/b\\c')).toEqual(['a', 'b', 'c']);
  });
});

describe('isUnsafePath', () => {
  it.each([
    '/etc/x',
    '\\x',
    '\\\\server\\share\\x',
    'C:x',
    'c:\\x',
    'C:/x',
    '../a',
    'a/../b',
    'a\\..\\b',
    'a/..',
    '.../x',
    '.. /x',
    'a/. ./x',
    'a\u0000b',
  ])('RF-122 RF-129 refuses %j', (path) => {
    expect(isUnsafePath(path)).toBe(true);
  });

  it.each(['a/b.txt', 'a/./b', 'a\\b', 'src/Orders.cs', 'a/b:c/d', 'a/.hidden', 'a/..b/c'])(
    'RF-122 RF-129 accepts %j',
    (path) => {
      expect(isUnsafePath(path)).toBe(false);
    },
  );
});

describe('hasUnwritableSegment', () => {
  it.each([
    ['aux.c'],
    ['src', 'COM1'],
    ['nul'],
    ['con '],
    ['aux.'],
    ['con:stream'],
    ['a:b.txt'],
    ['CONIN$'],
    ['COM¹'],
    ['lpt9.log'],
  ])('RF-122 RF-129 finds a name Windows cannot write in %j', (...segments) => {
    expect(hasUnwritableSegment(segments)).toBe(true);
  });

  it.each([['console.log'], ['src', 'Orders.cs'], ['auxiliary.c'], ['com10'], ['connect.cs']])(
    'RF-122 RF-129 accepts %j',
    (...segments) => {
      expect(hasUnwritableSegment(segments)).toBe(false);
    },
  );
});

describe('isInLeftOutFolder', () => {
  it.each([
    ['node_modules/a.js'],
    ['src/node_modules/a.js'],
    ['.git/config'],
    ['bin/app.dll'],
    ['obj/a.json'],
    ['src/Bin/app.dll'],
    ['src\\OBJ\\a.json'],
    ['__MACOSX/._a.txt'],
    ['proj/__MACOSX/b.txt'],
    ['proj/__macosx/b.txt'],
  ])('RF-129 leaves out %j', (path) => {
    expect(isInLeftOutFolder(splitPath(path))).toBe(true);
  });

  it.each([
    ['bin'],
    ['binary/a.txt'],
    ['src/a.cs'],
    ['git/config'],
    ['.gitignore'],
    ['a/obj'],
    ['__MACOSX'],
    ['MACOSX/a.txt'],
    ['src/__MACOSX_notes.txt'],
  ])('RF-129 keeps %j', (path) => {
    expect(isInLeftOutFolder(splitPath(path))).toBe(false);
  });
});

describe('LimitCounter', () => {
  it('RF-127 RF-129 accepts amounts up to the limit and refuses the first one past it', () => {
    const counter = new LimitCounter(5);

    expect(counter.add(3)).toBe(true);
    expect(counter.add(2)).toBe(true);
    expect(counter.add(1)).toBe(false);
  });

  it('RF-127 RF-129 counts one by default', () => {
    const counter = new LimitCounter(2);

    expect([counter.add(), counter.add(), counter.add()]).toEqual([true, true, false]);
  });
});
