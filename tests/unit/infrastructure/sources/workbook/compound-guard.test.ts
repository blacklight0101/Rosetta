import { expect, it } from 'vitest';
import { compoundFileProblem } from '../../../../../src/infrastructure/sources/workbook/compound-guard.js';

// RF-154, ADR-023: `cfb` follows every sector chain without remembering where it has been, so the
// header and the allocation table are checked first. These files are made by hand, field by field.

const SECTOR = 512;
const PER_SECTOR = SECTOR / 4;

interface Shape {
  readonly sectors: number;
  /** The next sector of each sector in the table; the default is the end of the chain. */
  readonly next?: (sector: number) => number;
  readonly directory?: number;
  readonly fatSlot0?: number;
  readonly difatCount?: number;
  readonly difatStart?: number;
  /** The first sectors are a chain of this many DIFAT sectors (the header is set to match). */
  readonly difatSectors?: number;
  readonly sectorShift?: number;
  readonly miniShift?: number;
  readonly version?: number;
}

const DEFAULTS = {
  version: 3,
  sectorShift: 9,
  miniShift: 6,
  directory: 0,
  difatStart: -2,
  difatCount: 0,
  next: () => -2,
};

function compound(given: Shape): Buffer {
  const shape = { ...DEFAULTS, ...given };
  const fatCount = Math.ceil(shape.sectors / PER_SECTOR);
  const bytes = Buffer.alloc(SECTOR * (1 + shape.sectors + fatCount));
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(bytes);
  bytes.writeUInt16LE(shape.version, 0x1a);
  bytes.writeUInt16LE(0xfffe, 0x1c);
  bytes.writeUInt16LE(shape.sectorShift, 0x1e);
  bytes.writeUInt16LE(shape.miniShift, 0x20);
  bytes.writeInt32LE(shape.directory, 0x30);
  bytes.writeInt32LE(shape.difatStart, 0x44);
  bytes.writeUInt32LE(shape.difatCount, 0x48);
  for (let slot = 0; slot < 109; slot++) {
    const id = slot < fatCount ? shape.sectors + slot : -1;
    bytes.writeInt32LE(
      slot === 0 && shape.fatSlot0 !== undefined ? shape.fatSlot0 : id,
      0x4c + slot * 4,
    );
  }
  for (let entry = 0; entry < fatCount * PER_SECTOR; entry++) {
    const next = entry < shape.sectors ? shape.next(entry) : -1;
    bytes.writeInt32LE(next, SECTOR * (1 + shape.sectors) + entry * 4);
  }
  writeDifat(bytes, shape.difatSectors ?? 0);
  return bytes;
}

function writeDifat(bytes: Buffer, count: number): void {
  if (count === 0) return;
  bytes.writeInt32LE(0, 0x44);
  bytes.writeUInt32LE(count, 0x48);
  for (let sector = 0; sector < count; sector++) {
    const at = SECTOR * (1 + sector);
    for (let slot = 0; slot < PER_SECTOR - 1; slot++) bytes.writeInt32LE(-1, at + slot * 4);
    bytes.writeInt32LE(sector + 1 < count ? sector + 1 : -2, at + SECTOR - 4);
  }
}

it('RF-154 accepts a compound file whose table is a set of short chains', () => {
  expect(compoundFileProblem(compound({ sectors: 8, next: (s) => (s < 3 ? s + 1 : -2) }))).toBe(
    undefined,
  );
});

it('RF-154 refuses a table whose chain comes back to itself', () => {
  const loop = compound({ sectors: 8, next: (s) => (s === 1 ? 0 : s === 0 ? 1 : -2) });
  const self = compound({ sectors: 8, next: (s) => (s === 2 ? 2 : -2) });

  expect(compoundFileProblem(loop)).toContain('loops');
  expect(compoundFileProblem(self)).toContain('loops');
});

it('RF-154 accepts a short DIFAT chain and refuses one past the limit of 64', () => {
  expect(compoundFileProblem(compound({ sectors: 200, difatSectors: 3 }))).toBe(undefined);
  expect(compoundFileProblem(compound({ sectors: 200, difatSectors: 70 }))).toContain('too long');
});

it('RF-154 refuses a directory chain longer than the directory limit', () => {
  const long = (sectors: number): Buffer =>
    compound({ sectors, next: (s) => (s + 1 < sectors ? s + 1 : -2) });

  expect(compoundFileProblem(long(4500))).toContain('directory is too large');
  expect(compoundFileProblem(long(4000))).toBe(undefined);
});

it.each([
  ['a signature that is wrong', Buffer.alloc(1024)],
  ['a file shorter than a header', Buffer.alloc(100)],
  ['a version that is not 3 or 4', compound({ sectors: 4, version: 9 })],
  ['a sector size that does not match the version', compound({ sectors: 4, sectorShift: 12 })],
  ['a mini sector size that is not 64', compound({ sectors: 4, miniShift: 7 })],
  ['a directory sector outside the file', compound({ sectors: 4, directory: 1000 })],
  ['a negative directory sector', compound({ sectors: 4, directory: -5 })],
  ['a table sector outside the file', compound({ sectors: 4, fatSlot0: 90000 })],
  ['a DIFAT chain of absurd length', compound({ sectors: 4, difatCount: 0x7fffffff })],
  ['a DIFAT chain shorter than it says', compound({ sectors: 4, difatCount: 2, difatStart: -2 })],
])('RF-154 refuses %s', (_name, bytes) => {
  expect(compoundFileProblem(bytes)).toBeTypeOf('string');
});
