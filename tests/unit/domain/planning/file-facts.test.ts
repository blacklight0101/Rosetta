import { describe, expect, it } from 'vitest';
import {
  encodingOf,
  kindOf,
  lineEndingOf,
  measuredFile,
  unusualNameReasons,
} from '../../../../src/domain/planning/file-facts.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-632, DEC-135: the facts the package measures from one file of the scan: its kind, its encoding,
// its line endings and whether its name is one some systems refuse.

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('encodingOf', () => {
  it.each([
    ['empty', new Uint8Array()],
    ['ASCII', text('plain text\n')],
    ['UTF-8', text('café\n')],
    ['UTF-8 with BOM', Uint8Array.from([0xef, 0xbb, 0xbf, 0x61])],
    ['UTF-16 LE', Uint8Array.from([0xff, 0xfe, 0x61, 0x00])],
    ['UTF-16 BE', Uint8Array.from([0xfe, 0xff, 0x00, 0x61])],
    ['legacy 8-bit', Uint8Array.from([0x63, 0x61, 0x66, 0xe9])],
    ['binary', Uint8Array.from([0x50, 0x4b, 0x00, 0x03])],
  ] as const)('RF-632 reads %s', (expected, bytes) => {
    expect(encodingOf(bytes)).toBe(expected);
  });

  it('RF-632 does not take a cut multi-byte character for UTF-8', () => {
    expect(encodingOf(Uint8Array.from([0x61, 0xc3]))).toBe('legacy 8-bit');
  });

  it('RF-632 takes a NUL byte after a text start for binary', () => {
    expect(encodingOf(Uint8Array.from([0x61, 0x62, 0x00]))).toBe('binary');
  });
});

describe('lineEndingOf', () => {
  it.each([
    ['LF', 'a\nb\n'],
    ['CRLF', 'a\r\nb\r\n'],
    ['CR', 'a\rb\r'],
    ['mixed', 'a\r\nb\nc\n'],
    ['mixed', 'a\rb\nc'],
    ['single line', 'one line'],
  ] as const)('RF-632 reads %s', (expected, value) => {
    expect(lineEndingOf(text(value), 'UTF-8')).toBe(expected);
  });

  it('RF-632 reads the line endings of a UTF-16 file after decoding it', () => {
    const bytes = Uint8Array.from([0xff, 0xfe, 0x61, 0x00, 0x0d, 0x00, 0x0a, 0x00, 0x62, 0x00]);

    expect(lineEndingOf(bytes, 'UTF-16 LE')).toBe('CRLF');
  });

  it('RF-632 states no line ending for a binary or an empty file', () => {
    expect(lineEndingOf(Uint8Array.from([0, 1, 10]), 'binary')).toBeUndefined();
    expect(lineEndingOf(new Uint8Array(), 'empty')).toBeUndefined();
  });
});

describe('kindOf', () => {
  it.each([
    ['Orders/Cart.cs', { language: 'csharp' }, 'source'],
    ['Web.config', { language: 'xml' }, 'data and configuration'],
    ['README.md', { language: 'markdown' }, 'documentation'],
    ['Scripts/jquery-3.4.1.min.map', { language: 'unknown' }, 'generated map'],
    ['Content/site.css.map', { language: 'unknown' }, 'generated map'],
    ['Scripts/jquery-3.4.1.min.js', { language: 'javascript' }, 'bundled third-party script'],
    ['Scripts/bootstrap.bundle.js', { language: 'javascript' }, 'bundled third-party script'],
    ['lib/logo.png', { language: 'unknown', skipped: 'binary' }, 'binary'],
    ['Orders/notes.xyz', { language: 'unknown' }, 'other'],
  ] as const)('RF-632 puts %s in %s', (path, extra, kind) => {
    expect(kindOf(entry(path, 10, extra))).toBe(kind);
  });

  it('RF-632 takes a file with very long lines for a bundled script', () => {
    const bundle = entry('web/app.js', 5000, { language: 'javascript', lines: 2 });

    expect(kindOf(bundle)).toBe('bundled third-party script');
  });

  it('RF-632 is not fooled by the letter case of the extension', () => {
    expect(kindOf(entry('Scripts/Site.MAP', 10, { language: 'unknown' }))).toBe('generated map');
  });
});

describe('unusualNameReasons', () => {
  it.each([
    'aux.c',
    'AUX.c',
    'Aux',
    'src/con.txt',
    'nul.tar.gz',
    'PRN',
    'src/COM1.log',
    'lpt9',
    'aux/readme.txt',
  ])('RF-632 names %s a reserved device name', (path) => {
    expect(unusualNameReasons(path)).toContain('reserved device name');
  });

  it.each(['auxiliary.c', 'console.log', 'com10.txt', 'com0.txt', 'lpt.txt', 'src/null.cs'])(
    'RF-632 does not name %s a reserved device name',
    (path) => {
      expect(unusualNameReasons(path)).not.toContain('reserved device name');
    },
  );

  it.each(['name.', 'src/dir /file.txt', 'a:b.txt', 'a?b', 'a*b', 'a"b', 'a<b>c', 'a|b'])(
    'RF-632 names %s a name some systems refuse',
    (path) => {
      expect(unusualNameReasons(path)).toContain('character or ending some systems refuse');
    },
  );

  it('RF-632 names a control character in a file name', () => {
    expect(unusualNameReasons('src/a\u0007b.txt')).toContain(
      'character or ending some systems refuse',
    );
  });

  it('RF-632 names a path over 260 characters and a non-ASCII name', () => {
    expect(unusualNameReasons(`${'d/'.repeat(128)}fg.cs`)).toContain('path over 260 characters');
    expect(unusualNameReasons('src/café.cs')).toContain('non-ASCII name');
    expect(unusualNameReasons(`${'d/'.repeat(128)}f.cs`)).toEqual([]);
  });

  it('RF-632 names an ordinary file nothing', () => {
    expect(unusualNameReasons('src/Orders/Cart.cs')).toEqual([]);
  });
});

describe('measuredFile', () => {
  it('RF-632 takes the kind, size, encoding and line ending of a file that was read', () => {
    const file = measuredFile(entry('a/b.cs', 5, { language: 'csharp' }), 12, text('x\r\ny\r\n'));

    expect(file).toEqual({
      path: 'a/b.cs',
      kind: 'source',
      bytes: 12,
      encoding: 'ASCII',
      lineEnding: 'CRLF',
    });
  });

  it('RF-632 states only the size of a file that was too large to be read', () => {
    const file = measuredFile(entry('a/big.cs', 0, { language: 'csharp' }), 9_000_000, undefined);

    expect(file.bytes).toBe(9_000_000);
    expect(file.encoding).toBeUndefined();
    expect(file.lineEnding).toBeUndefined();
  });
});

describe('unusualNameReasons, other spellings of a reserved name', () => {
  it.each(['COM¹', 'src/lpt².txt', 'COM³.log'])(
    'RF-632 names %s a reserved device name (superscript digit)',
    (path) => {
      expect(unusualNameReasons(path)).toContain('reserved device name');
    },
  );
});
