import { expect, it } from 'vitest';
import { compoundFileProblem } from '../../../../../src/infrastructure/sources/workbook/compound-guard.js';
import {
  buildCompound,
  directorySectors,
  ROOT_ONLY,
  withDifat,
  type CompoundSpec,
  type EntrySpec,
} from '../../../../support/hand-made-compound.js';

// RF-154, ADR-023: `cfb` follows every sector chain without remembering where it has been, copies
// each chain it meets and arranges the directory in quadratic time. The header, the allocation table
// and the directory are checked first; these files are made by hand, field by field.

const ROOT: EntrySpec = { type: 5, child: 1 };

function withDirectory(entries: readonly EntrySpec[], more: Partial<CompoundSpec> = {}): Buffer {
  const sectors = directorySectors(entries);
  const next = (s: number): number => (s < sectors.length - 1 ? s + 1 : -2);
  return buildCompound({ sectors, next, ...more });
}

/** A file whose first sector is the directory and whose later sectors are chained by `next`. */
function chained(count: number, next: (sector: number) => number, entries: EntrySpec[] = [ROOT]) {
  return withDirectory(entries, { count, next: (s) => (s === 0 ? -2 : next(s)) });
}

it('RF-154 accepts a compound file made of a directory and short chains', () => {
  expect(compoundFileProblem(buildCompound({ sectors: ROOT_ONLY }))).toBe(undefined);
  expect(compoundFileProblem(chained(8, (s) => (s < 3 ? s + 1 : -2), [{ type: 5 }]))).toBe(
    undefined,
  );
});

it('RF-154 refuses a table whose chain comes back to itself', () => {
  const loop = chained(8, (s) => (s === 1 ? 2 : s === 2 ? 1 : -2));
  const self = chained(8, (s) => (s === 2 ? 2 : -2));

  expect(compoundFileProblem(loop)).toContain('loops');
  expect(compoundFileProblem(self)).toContain('loops');
});

it('RF-154 refuses two chains that share a sector', () => {
  const merged = chained(8, (s) => (s === 1 || s === 2 ? 3 : -2));

  expect(compoundFileProblem(merged)).toContain('share a sector');
});

it('RF-154 refuses a chain that runs against the file order, which makes cfb walk it again and again', () => {
  const backwards = chained(300, (s) => (s > 2 ? s - 1 : -2), [{ type: 5 }]);
  const forwards = chained(300, (s) => (s < 299 ? s + 1 : -2), [{ type: 5 }]);

  expect(compoundFileProblem(backwards)).toContain('walked too many times');
  expect(compoundFileProblem(forwards)).toBe(undefined);
});

it('RF-154 refuses a directory chain longer than the entry limit', () => {
  const entries = Array.from({ length: 12 }, () => ({ type: 0 }));

  expect(
    compoundFileProblem(withDirectory(entries, { next: (s) => (s < 2 ? s + 1 : -2), count: 3 }), 8),
  ).toContain('too large');
  expect(compoundFileProblem(buildCompound({ sectors: ROOT_ONLY }), 4)).toBe(undefined);
});

it('RF-154 refuses 16,000 nested storages in a 2 MB file at once', () => {
  const entries: EntrySpec[] = Array.from({ length: 16_000 }, (_, i) => ({
    type: i === 0 ? 5 : 1,
    child: i + 1 < 16_000 ? i + 1 : -1,
  }));
  const file = withDirectory(entries, { next: (s) => (s < 3999 ? s + 1 : -2) });

  expect(file.length).toBeGreaterThan(2_000_000);
  expect(compoundFileProblem(file)).toContain('directory is too large');
});

it('RF-154 refuses a directory tree that loops, and an entry with two parents', () => {
  const loop = withDirectory([ROOT, { type: 1, right: 2 }, { type: 1, right: 1 }]);
  const twice = withDirectory([ROOT, { type: 1, left: 2, right: 2 }, { type: 1 }]);

  expect(compoundFileProblem(loop)).toContain('reached twice');
  expect(compoundFileProblem(twice)).toContain('reached twice');
});

it('RF-154 refuses storages nested deeper than 32 and accepts 30', () => {
  const nested = (depth: number): Buffer =>
    withDirectory(
      Array.from({ length: depth + 1 }, (_, i) => ({
        type: i === 0 ? 5 : 1,
        child: i < depth ? i + 1 : -1,
      })),
    );

  expect(compoundFileProblem(nested(40))).toContain('nested too deep');
  expect(compoundFileProblem(nested(30))).toBe(undefined);
});

it.each([
  ['an entry that points outside the directory', [ROOT, { type: 2, right: 99 }]],
  ['a first entry that is not the root', [{ type: 1 }]],
  ['an entry that no one points at', [{ type: 5 }, { type: 2 }]],
  ['a second root', [ROOT, { type: 5 }]],
])('RF-154 refuses %s', (_name, entries) => {
  expect(compoundFileProblem(withDirectory(entries))).toBeTypeOf('string');
});

/** Streams starting at `starts`, each a chain of `block` sectors (a whole block ends in the end mark). */
function streams(starts: readonly number[], size = 4096, block = 8): Buffer {
  const entries: EntrySpec[] = [
    ROOT,
    ...starts.map((start, i): EntrySpec => ({
      type: 2,
      start,
      size,
      ...(i + 1 < starts.length ? { right: i + 2 } : {}),
    })),
  ];
  const dirSectors = Math.ceil(entries.length / 4);
  const next = (s: number): number => {
    if (s < dirSectors) return s === dirSectors - 1 ? -2 : s + 1;
    return (s - dirSectors) % block === block - 1 ? -2 : s + 1;
  };
  return withDirectory(entries, { count: 40, next });
}

it('RF-154 accepts streams whose chains are their own', () => {
  expect(compoundFileProblem(streams([1, 9, 17]))).toBe(undefined);
});

it('RF-154 refuses two streams that share a chain, or one that starts in the middle of another', () => {
  expect(compoundFileProblem(streams([1, 1]))).toContain('share a sector');
  expect(compoundFileProblem(streams([1, 5]))).toContain('share a sector');
});

it('RF-154 refuses a stream that takes the directory sector', () => {
  expect(compoundFileProblem(streams([0]))).toContain('share a sector');
});

it('RF-154 refuses streams that declare more bytes than the file holds', () => {
  const six = streams([2, 3, 4, 5, 6, 7], 10_000, 1);

  expect(six.length).toBeLessThan(60_000);
  expect(compoundFileProblem(six)).toContain('declare more bytes');
  expect(compoundFileProblem(streams([1], 100_000, 1))).toContain('declare more bytes');
});

function miniStreams(second: number): Buffer {
  const miniFat = Buffer.alloc(512, 0xff);
  miniFat.writeInt32LE(1, 0);
  miniFat.writeInt32LE(-2, 4);
  miniFat.writeInt32LE(-2, 8);
  const entries: EntrySpec[] = [
    { type: 5, child: 1, start: 1, size: 640 },
    { type: 2, start: 0, size: 128, right: 2 },
    { type: 2, start: second, size: 64 },
  ];
  return withDirectory(entries, {
    sectors: [...directorySectors(entries), Buffer.alloc(512), Buffer.alloc(512), miniFat],
    next: (s) => (s === 1 ? 2 : -2),
    miniFatStart: 3,
    miniFatCount: 1,
  });
}

it('RF-154 refuses two short streams that share a mini sector', () => {
  expect(compoundFileProblem(miniStreams(1))).toContain('share a sector');
  expect(compoundFileProblem(miniStreams(2))).toBe(undefined);
});

it('RF-154 accepts a short DIFAT chain and refuses one past the limit of 64', () => {
  const base = (): Buffer =>
    buildCompound({
      sectors: [...Array.from({ length: 5 }, () => Buffer.alloc(512)), ...ROOT_ONLY],
      count: 200,
      directory: 5,
    });

  expect(compoundFileProblem(withDifat(base(), 3))).toBe(undefined);
  expect(compoundFileProblem(withDifat(base(), 70))).toContain('too long');
});

it.each([
  ['a signature that is wrong', Buffer.alloc(1024)],
  ['a file shorter than a header', Buffer.alloc(100)],
  ['a version that is not 3 or 4', buildCompound({ sectors: ROOT_ONLY, version: 9 })],
  [
    'a sector size that does not match the version',
    buildCompound({ sectors: ROOT_ONLY, sectorShift: 12 }),
  ],
  ['a mini sector size that is not 64', buildCompound({ sectors: ROOT_ONLY, miniShift: 7 })],
  ['a mini stream cutoff that is not 4096', buildCompound({ sectors: ROOT_ONLY, cutoff: 8192 })],
  [
    'a size that is not a whole number of sectors',
    buildCompound({ sectors: ROOT_ONLY, trailing: 100 }),
  ],
  ['a directory sector outside the file', buildCompound({ sectors: ROOT_ONLY, directory: 1000 })],
  ['a negative directory sector', buildCompound({ sectors: ROOT_ONLY, directory: -5 })],
  ['a table sector outside the file', buildCompound({ sectors: ROOT_ONLY, fatSlot0: 90000 })],
  ['a DIFAT chain of absurd length', buildCompound({ sectors: ROOT_ONLY, difatCount: 0x7fffffff })],
  ['a DIFAT chain shorter than it says', buildCompound({ sectors: ROOT_ONLY, difatCount: 2 })],
])('RF-154 refuses %s', (_name, bytes) => {
  expect(compoundFileProblem(bytes)).toBeTypeOf('string');
});
