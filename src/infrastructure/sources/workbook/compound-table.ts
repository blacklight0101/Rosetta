// RF-154: the header and the allocation table (FAT) of a compound file (MS-CFB), read the way
// `cfb` reads them and checked before `cfb` is given the file. `cfb` follows a sector chain without
// remembering where it has been and copies every chain it meets, so a table whose chain loops, whose
// chains merge, or whose chains are met from the middle first, makes it collect sectors until memory
// ends. The table is therefore walked here, iteratively, with every sector marked.

const SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const HEADER_FAT_SLOTS = 109;
const MAX_DIFAT_SECTORS = 64;
const FIRST_FAT_SLOT_AT = 0x4c;
const END_OF_CHAIN = -2;
/** `cfb` copies sectors once per chain walk; a file that makes it walk more than this is refused. */
const MAX_WALK_FACTOR = 3;

export interface Layout {
  readonly view: DataView;
  readonly sectorSize: number;
  /** Whole sectors after the header. */
  readonly sectors: number;
}

function headerProblem(view: DataView, version: number): string | undefined {
  if (version !== 3 && version !== 4) return 'the major version is not 3 or 4';
  if (view.getUint16(0x1e, true) !== (version === 3 ? 9 : 12)) {
    return 'the sector size does not match the version';
  }
  if (view.getUint16(0x20, true) !== 6) return 'the mini sector size is not 64 bytes';
  return view.getUint32(0x38, true) === 4096 ? undefined : 'the mini stream cutoff is not 4096';
}

export function layoutOf(bytes: Uint8Array): Layout | string {
  if (bytes.length < 512) return 'the file is shorter than a compound file header';
  if (!Buffer.from(bytes.subarray(0, 8)).equals(SIGNATURE)) return 'the signature is wrong';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(0x1a, true);
  const problem = headerProblem(view, version);
  if (problem !== undefined) return problem;
  const sectorSize = version === 3 ? 512 : 4096;
  if (bytes.length % sectorSize !== 0) return 'the file is not a whole number of sectors';
  return { view, sectorSize, sectors: bytes.length / sectorSize - 1 };
}

function headerSlots(view: DataView): number[] {
  const ids: number[] = [];
  for (let slot = 0; slot < HEADER_FAT_SLOTS; slot++) {
    const id = view.getInt32(FIRST_FAT_SLOT_AT + slot * 4, true);
    if (id < 0) break;
    ids.push(id);
  }
  return ids;
}

/** The slots of one DIFAT sector, up to the end-of-chain mark, and the sector it chains to. */
function difatSector(layout: Layout, sector: number): { ids: number[]; next: number } {
  const at = (sector + 1) * layout.sectorSize;
  const ids: number[] = [];
  for (let slot = 0; slot < layout.sectorSize / 4 - 1; slot++) {
    const id = layout.view.getInt32(at + slot * 4, true);
    if (id === END_OF_CHAIN) break;
    ids.push(id);
  }
  return { ids, next: layout.view.getInt32(at + layout.sectorSize - 4, true) };
}

/**
 * The sectors holding the table, in the order and with the quirks of `cfb`: 109 from the header, then
 * the DIFAT chain, which `cfb` follows one sector further than its count says and whose slots it
 * keeps whatever they hold, until the end-of-chain mark.
 */
export function fatSectors(layout: Layout): number[] | string {
  const ids = headerSlots(layout.view);
  let count = layout.view.getUint32(0x48, true);
  if (count > MAX_DIFAT_SECTORS || count > layout.sectors) return 'the DIFAT chain is too long';
  let next = layout.view.getInt32(0x44, true);
  while (next >= 0 && next < layout.sectors) {
    const sector = difatSector(layout, next);
    ids.push(...sector.ids);
    if (count-- < 1) break;
    next = sector.next;
  }
  const short = next === END_OF_CHAIN && count > 0;
  return short ? 'the DIFAT chain is shorter than it says' : ids;
}

/** The whole table. A slot without a sector behind it ends every chain that reaches it. */
export function tableOf(layout: Layout, ids: readonly number[]): Int32Array | string {
  const perSector = layout.sectorSize / 4;
  const table = new Int32Array(ids.length * perSector).fill(END_OF_CHAIN);
  for (const [index, id] of ids.entries()) {
    if (id >= layout.sectors) return 'a table sector is outside the file';
    if (id < 0) continue;
    const at = (id + 1) * layout.sectorSize;
    for (let slot = 0; slot < perSector; slot++) {
      table[index * perSector + slot] = layout.view.getInt32(at + slot * 4, true);
    }
  }
  return table;
}

/** The sector a table entry points at, or -1 when it ends the chain or points outside the table. */
export function nextOf(table: Int32Array, at: number): number {
  const next = table[at] ?? -1;
  return next >= 0 && next < table.length ? next : -1;
}

/** True when some chain of the table comes back to a sector it has already passed through. */
function hasLoop(table: Int32Array): boolean {
  const state = new Uint8Array(table.length);
  for (let start = 0; start < table.length; start++) {
    if (state[start] !== 0) continue;
    let at = start;
    while (at >= 0 && state[at] === 0) {
      state[at] = 1;
      at = nextOf(table, at);
    }
    if (at >= 0 && state[at] === 1) return true;
    for (let mark = start; mark >= 0 && state[mark] === 1; mark = nextOf(table, mark)) {
      state[mark] = 2;
    }
  }
  return false;
}

/** True when two entries point at the same sector: two chains would share a tail. */
function hasMerge(table: Int32Array): boolean {
  const pointedAt = new Uint8Array(table.length);
  for (let at = 0; at < table.length; at++) {
    const next = nextOf(table, at);
    if (next < 0) continue;
    if (pointedAt[next] !== 0) return true;
    pointedAt[next] = 1;
  }
  return false;
}

/**
 * Sectors `cfb` walks to arrange the chains: it starts a walk at every sector not yet seen, in file
 * order from the directory sector, and a chain met from its middle is later walked again from its head.
 */
function walkSteps(table: Int32Array, sectors: number, directory: number, limit: number): number {
  const seen = new Uint8Array(table.length);
  let steps = 0;
  for (let i = 0; i < sectors && steps <= limit; i++) {
    const start = (i + directory) % sectors;
    for (let at = seen[start] === 0 ? start : -1; at >= 0; at = nextOf(table, at)) {
      seen[at] = 1;
      steps++;
    }
  }
  return steps;
}

export function tableProblem(layout: Layout, table: Int32Array): string | undefined {
  if (hasLoop(table)) return 'a sector chain loops back on itself';
  if (hasMerge(table)) return 'two sector chains share a sector';
  const directory = layout.view.getInt32(0x30, true);
  const limit = MAX_WALK_FACTOR * layout.sectors + 64;
  return walkSteps(table, layout.sectors, directory, limit) > limit
    ? 'the sector chains are walked too many times'
    : undefined;
}
