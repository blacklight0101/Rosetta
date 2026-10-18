import { describe, expect, it } from 'vitest';
import type { MeasuredFile } from '../../../../src/domain/planning/file-facts.js';
import { shapesOf } from '../../../../src/domain/planning/scan-shapes.js';

// RF-632, DEC-135: the measured shapes of a scan, from the facts of its files: the largest files,
// the size by kind, the deepest paths, the unusual names, the encodings and the line endings. The
// same files always give the same shapes, in a fixed order.

const REASON_CASE = 'differs from another path only by letter case';

function file(path: string, bytes: number, extra: Partial<MeasuredFile> = {}): MeasuredFile {
  return { path, bytes, kind: 'source', encoding: 'ASCII', lineEnding: 'LF', ...extra };
}

describe('shapesOf sizes', () => {
  it('RF-632 counts the files and their bytes', () => {
    const shapes = shapesOf([file('a.cs', 10), file('b.cs', 32)], [], 0);

    expect(shapes.files).toBe(2);
    expect(shapes.totalBytes).toBe(42);
  });

  it('RF-632 lists the ten largest files, the largest first, ties by path', () => {
    const files = Array.from({ length: 12 }, (_none, at) => file(`f${String(at)}.cs`, 100 + at));
    const tied = [file('z.cs', 500), file('b.cs', 500), ...files];

    const largest = shapesOf(tied, [], 0).largest.map((each) => each.path);

    expect(largest).toHaveLength(10);
    expect(largest.slice(0, 3)).toEqual(['b.cs', 'z.cs', 'f11.cs']);
  });

  it('RF-632 totals the size by kind in a fixed order, leaving out a kind with no file', () => {
    const shapes = shapesOf(
      [
        file('a.js', 100, { kind: 'bundled third-party script' }),
        file('a.js.map', 400, { kind: 'generated map' }),
        file('b.map', 600, { kind: 'generated map' }),
        file('c.cs', 7),
      ],
      [],
      0,
    );

    expect(shapes.byKind).toEqual([
      { kind: 'source', files: 1, bytes: 7 },
      { kind: 'generated map', files: 2, bytes: 1000 },
      { kind: 'bundled third-party script', files: 1, bytes: 100 },
    ]);
  });
});

describe('shapesOf paths', () => {
  it('RF-632 lists the five deepest paths by their number of segments', () => {
    const paths = ['a.cs', 'a/b.cs', 'a/b/c.cs', 'a/b/c/d.cs', 'a/b/c/d/e.cs'];
    const more = ['a/b/c/d/e/f.cs', 'x/y/z/w/v/u.cs'];

    const shapes = shapesOf(
      [...paths, ...more].map((path) => file(path, 1)),
      [],
      0,
    );

    expect(shapes.deepest).toEqual([
      { path: 'a/b/c/d/e/f.cs', depth: 6 },
      { path: 'x/y/z/w/v/u.cs', depth: 6 },
      { path: 'a/b/c/d/e.cs', depth: 5 },
      { path: 'a/b/c/d.cs', depth: 4 },
      { path: 'a/b/c.cs', depth: 3 },
    ]);
  });

  it('RF-632 lists the unusual names with their reasons, the refused names too', () => {
    const files = [file('src/ok.cs', 1), file('src/AUX.txt', 1)];

    const shapes = shapesOf(files, ['legacy/aux.c', 'bad.'], 0);

    expect(shapes.unusualNames).toEqual([
      { path: 'bad.', reasons: ['character or ending some systems refuse'] },
      { path: 'legacy/aux.c', reasons: ['reserved device name'] },
      { path: 'src/AUX.txt', reasons: ['reserved device name'] },
    ]);
  });

  it('RF-632 names two paths that differ only by letter case', () => {
    const files = [file('src/Readme.md', 1), file('src/README.md', 1), file('src/x.md', 1)];

    const shapes = shapesOf(files, [], 0);

    expect(shapes.unusualNames).toEqual([
      { path: 'src/README.md', reasons: ['differs from another path only by letter case'] },
      { path: 'src/Readme.md', reasons: ['differs from another path only by letter case'] },
    ]);
  });
});

describe('shapesOf contents', () => {
  it('RF-632 counts the encodings and the line endings of the files that were read', () => {
    const shapes = shapesOf(
      [
        file('a', 1, { encoding: 'UTF-8', lineEnding: 'CRLF' }),
        file('b', 1, { encoding: 'UTF-8', lineEnding: 'CRLF' }),
        file('c', 1, { encoding: 'ASCII', lineEnding: 'LF' }),
        file('d', 1, { encoding: 'binary', lineEnding: undefined }),
        file('e', 1, { encoding: undefined, lineEnding: undefined }),
      ],
      [],
      0,
    );

    expect(shapes.encodings).toEqual([
      { name: 'UTF-8', files: 2 },
      { name: 'ASCII', files: 1 },
      { name: 'binary', files: 1 },
    ]);
    expect(shapes.lineEndings).toEqual([
      { name: 'CRLF', files: 2 },
      { name: 'LF', files: 1 },
    ]);
  });

  it('RF-632 keeps the count of files that could not be read', () => {
    expect(shapesOf([file('a.cs', 1)], [], 3).unreadable).toBe(3);
  });

  it('RF-632 gives the same shapes whatever the order of the files', () => {
    const files = [file('b.cs', 5), file('a.cs', 5), file('c/d.cs', 9)];

    expect(shapesOf([...files].reverse(), [], 0)).toEqual(shapesOf(files, [], 0));
  });
});

describe('shapesOf, other spellings and bounds', () => {
  it('RF-632 names two paths that differ only by letter case after Unicode normalisation', () => {
    const composed = 'src/CafÉ.md';
    const decomposed = 'src/café.md';

    const shapes = shapesOf([file(composed, 1), file(decomposed, 1)], [], 0);

    expect(shapes.unusualNames.map((each) => each.reasons.includes(REASON_CASE))).toContain(true);
  });

  it('RF-632 keeps the count of files whose content was not read for the total limit', () => {
    expect(shapesOf([file('a.cs', 1)], [], 0, 4).beyondTotal).toBe(4);
    expect(shapesOf([file('a.cs', 1)], [], 0).beyondTotal).toBe(0);
  });
});
