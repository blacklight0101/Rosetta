import { describe, expect, it } from 'vitest';
import { createFileEntry } from '../../../../src/domain/code-map/file-entry.js';
import { entry } from '../../../support/code-map-builders.js';

describe('FileEntry', () => {
  it('RF-105 accepts a listed file with its counts, hash and map level', () => {
    const file = entry('src/Main.cs', 12, { language: 'csharp', mapLevel: 'symbols' });

    expect(createFileEntry(file)).toEqual({ ok: true, value: file });
  });

  it.each([
    ['an absolute path', '/etc/passwd'],
    ['a drive path', 'C:/repo/a.cs'],
    ['a backslash path', 'src\\a.cs'],
    ['a parent segment', 'src/../a.cs'],
    ['a dot segment', './a.cs'],
    ['an empty segment', 'src//a.cs'],
    ['an empty path', ''],
    ['a trailing slash', 'src/'],
  ])('RF-124 refuses %s', (_name, path) => {
    expect(createFileEntry(entry(path))).toEqual({ ok: false, error: 'invalid-path' });
  });

  it.each([
    ['negative lines', { lines: -1 }],
    ['fractional tokens', { estimatedTokens: 1.5 }],
  ])('RF-101 refuses %s', (_name, extra) => {
    expect(createFileEntry(entry('a.cs', 3, extra))).toEqual({ ok: false, error: 'invalid-count' });
  });

  it('RF-100 a skipped file has no lines and no tokens', () => {
    const skipped = entry('big.dat', 5, { skipped: 'binary' });

    expect(createFileEntry(skipped)).toEqual({ ok: false, error: 'skipped-file-has-counts' });
    expect(createFileEntry(entry('big.dat', 0, { skipped: 'binary' })).ok).toBe(true);
  });

  it('RF-100 a too-large file may have no hash, because it is never read', () => {
    const { sha256: _hash, ...withoutHash } = entry('huge.sql', 0, { skipped: 'too-large' });

    expect(createFileEntry(withoutHash).ok).toBe(true);
  });

  it('RF-100 a too-large file with a hash is refused', () => {
    expect(createFileEntry(entry('huge.sql', 0, { skipped: 'too-large' }))).toEqual({
      ok: false,
      error: 'too-large-file-has-hash',
    });
  });

  it('RF-105 refuses a hash that is not 64 lower-case hexadecimal characters', () => {
    expect(createFileEntry(entry('a.cs', 1, { sha256: 'ABC' }))).toEqual({
      ok: false,
      error: 'invalid-hash',
    });
  });
});
