// P3-45: compound files made by hand, field by field, for the guard that runs before `cfb` reads a
// file. Nothing here is a real file: sectors hold what a test puts in them, and the allocation table
// is written from a function so a chain can be made to loop, merge or run the wrong way.

const SECTOR = 512;
const PER_SECTOR = SECTOR / 4;
const ENTRY = 128;
const NONE = -1;
const END = -2;

export interface EntrySpec {
  readonly name?: string;
  /** 5 root, 1 storage, 2 stream, 0 free. */
  readonly type: number;
  readonly left?: number;
  readonly right?: number;
  readonly child?: number;
  readonly start?: number;
  readonly size?: number;
}

export function directoryEntry(spec: EntrySpec): Buffer {
  const bytes = Buffer.alloc(ENTRY);
  const name = Buffer.from(`${spec.name ?? ''}${String.fromCharCode(0)}`, 'utf16le');
  if (spec.type !== 0) name.copy(bytes);
  bytes.writeUInt16LE(spec.type === 0 ? 0 : name.length, 0x40);
  bytes.writeUInt8(spec.type, 0x42);
  bytes.writeInt32LE(spec.left ?? NONE, 0x44);
  bytes.writeInt32LE(spec.right ?? NONE, 0x48);
  bytes.writeInt32LE(spec.child ?? NONE, 0x4c);
  bytes.writeInt32LE(spec.start ?? (spec.type === 0 ? 0 : END), 0x74);
  bytes.writeUInt32LE(spec.size ?? 0, 0x78);
  return bytes;
}

/** Directory entries packed into whole sectors, the rest of the last sector blank. */
export function directorySectors(entries: readonly EntrySpec[]): Buffer[] {
  const padded = [...entries];
  while (padded.length % (SECTOR / ENTRY) !== 0) padded.push({ type: 0 });
  const bytes = Buffer.concat(padded.map(directoryEntry));
  return Array.from({ length: bytes.length / SECTOR }, (_, i) =>
    bytes.subarray(i * SECTOR, (i + 1) * SECTOR),
  );
}

export interface CompoundSpec {
  /** The sectors after the header; a missing one is zeros. */
  readonly sectors: readonly Buffer[];
  /** The number of sectors when `sectors` is shorter (the rest are zeros). */
  readonly count?: number;
  /** The next sector of each sector; the default ends the chain. */
  readonly next?: (sector: number) => number;
  readonly directory?: number;
  readonly miniFatStart?: number;
  readonly miniFatCount?: number;
  readonly difatStart?: number;
  readonly difatCount?: number;
  readonly fatSlot0?: number;
  readonly version?: number;
  readonly sectorShift?: number;
  readonly miniShift?: number;
  readonly cutoff?: number;
  /** Bytes added after the last sector. */
  readonly trailing?: number;
}

/** A directory of one root entry in sector 0. */
export const ROOT_ONLY = directorySectors([{ type: 5 }]);

const HEADER_DEFAULTS = {
  version: 3,
  sectorShift: 9,
  miniShift: 6,
  directory: 0,
  cutoff: 4096,
  miniFatStart: END,
  miniFatCount: 0,
  difatStart: END,
  difatCount: 0,
};

function headerOf(given: CompoundSpec, fatCount: number, total: number): Buffer {
  const spec = { ...HEADER_DEFAULTS, ...given };
  const header = Buffer.alloc(SECTOR);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header);
  header.writeUInt16LE(spec.version, 0x1a);
  header.writeUInt16LE(0xfffe, 0x1c);
  header.writeUInt16LE(spec.sectorShift, 0x1e);
  header.writeUInt16LE(spec.miniShift, 0x20);
  header.writeInt32LE(spec.directory, 0x30);
  header.writeUInt32LE(spec.cutoff, 0x38);
  header.writeInt32LE(spec.miniFatStart, 0x3c);
  header.writeUInt32LE(spec.miniFatCount, 0x40);
  header.writeInt32LE(spec.difatStart, 0x44);
  header.writeUInt32LE(spec.difatCount, 0x48);
  for (let slot = 0; slot < 109; slot++) {
    const id = slot < fatCount ? total + slot : NONE;
    header.writeInt32LE(slot === 0 ? (spec.fatSlot0 ?? id) : id, 0x4c + slot * 4);
  }
  return header;
}

/** The file: header, the given sectors, then the sectors of the allocation table. */
export function buildCompound(spec: CompoundSpec): Buffer {
  const total = Math.max(spec.count ?? 0, spec.sectors.length);
  const fatCount = Math.ceil(total / PER_SECTOR);
  const body = Buffer.alloc(SECTOR * (total + fatCount));
  spec.sectors.forEach((sector, index) => sector.copy(body, index * SECTOR));
  for (let entry = 0; entry < fatCount * PER_SECTOR; entry++) {
    const next = entry < total ? (spec.next?.(entry) ?? END) : NONE;
    body.writeInt32LE(next, SECTOR * total + entry * 4);
  }
  return Buffer.concat([headerOf(spec, fatCount, total), body, Buffer.alloc(spec.trailing ?? 0)]);
}

/** Chains the first sectors as a DIFAT chain of this length (the header is set to match). */
export function withDifat(file: Buffer, length: number): Buffer {
  const out = Buffer.from(file);
  out.writeInt32LE(0, 0x44);
  out.writeUInt32LE(length, 0x48);
  for (let sector = 0; sector < length; sector++) {
    const at = SECTOR * (1 + sector);
    for (let slot = 0; slot < PER_SECTOR - 1; slot++) out.writeInt32LE(NONE, at + slot * 4);
    out.writeInt32LE(sector + 1 < length ? sector + 1 : END, at + SECTOR - 4);
  }
  return out;
}
