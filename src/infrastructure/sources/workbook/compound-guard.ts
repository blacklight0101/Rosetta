// RF-154: checks the header and the allocation table of a compound file (MS-CFB) before `cfb`
// reads it. `cfb` follows every sector chain it is given without remembering where it has been, so
// a table whose entry points back into its own chain would make it collect sectors until memory
// runs out. Here the header fields are bounded and the table is walked once, iteratively, with
// each sector marked; a loop, a count that does not fit the file or an oversized directory is
// reported as text and `cfb` never sees the file.

const SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const HEADER_FAT_SLOTS = 109;
const MAX_DIFAT_SECTORS = 64;
/** Directory entries `cfb` is asked to arrange: it does so in quadratic time. */
const MAX_DIRECTORY_ENTRIES = 16_384;
const DIRECTORY_ENTRY_BYTES = 128;
const FIRST_FAT_SLOT_AT = 0x4c;

interface Layout {
  readonly view: DataView;
  readonly sectorSize: number;
  readonly sectors: number;
}

function layoutOf(bytes: Uint8Array): Layout | string {
  if (bytes.length < 512) return 'the file is shorter than a compound file header';
  if (!Buffer.from(bytes.subarray(0, 8)).equals(SIGNATURE)) return 'the signature is wrong';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(0x1a, true);
  const sectorShift = view.getUint16(0x1e, true);
  const sectorSize = version === 3 ? 512 : 4096;
  if (version !== 3 && version !== 4) return 'the major version is not 3 or 4';
  if (sectorShift !== (version === 3 ? 9 : 12)) return 'the sector size does not match the version';
  if (view.getUint16(0x20, true) !== 6) return 'the mini sector size is not 64 bytes';
  if (bytes.length < sectorSize) return 'the file is shorter than its header';
  // Only whole sectors are read here; `cfb` copes with a short last one itself.
  return { view, sectorSize, sectors: Math.floor(bytes.length / sectorSize) - 1 };
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

/** The sectors holding the allocation table: 109 in the header, the rest through the DIFAT chain. */
function fatSectors(layout: Layout): number[] | string {
  const { view, sectorSize, sectors } = layout;
  const ids = headerSlots(view);
  const difatCount = view.getUint32(0x48, true);
  if (difatCount > MAX_DIFAT_SECTORS || difatCount > sectors) return 'the DIFAT chain is too long';
  let next = view.getInt32(0x44, true);
  for (let i = 0; i < difatCount; i++) {
    if (next < 0 || next >= sectors) return 'the DIFAT chain is broken';
    const at = (next + 1) * sectorSize;
    for (let slot = 0; slot < sectorSize / 4 - 1; slot++) {
      const id = view.getInt32(at + slot * 4, true);
      if (id >= 0) ids.push(id);
    }
    next = view.getInt32(at + sectorSize - 4, true);
  }
  return ids.some((id) => id >= sectors) ? 'a table sector is outside the file' : ids;
}

function tableOf(layout: Layout, ids: readonly number[]): Int32Array {
  const perSector = layout.sectorSize / 4;
  const table = new Int32Array(ids.length * perSector);
  ids.forEach((id, index) => {
    const at = (id + 1) * layout.sectorSize;
    for (let slot = 0; slot < perSector; slot++) {
      table[index * perSector + slot] = layout.view.getInt32(at + slot * 4, true);
    }
  });
  return table;
}

/** The sector a table entry points at, or -1 when it ends the chain or points outside the table. */
function nextOf(table: Int32Array, at: number): number {
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

function directoryIsTooLarge(layout: Layout, table: Int32Array): boolean {
  const limit = (MAX_DIRECTORY_ENTRIES * DIRECTORY_ENTRY_BYTES) / layout.sectorSize;
  let at = layout.view.getInt32(0x30, true);
  for (let length = 0; at >= 0 && at < table.length; length++) {
    if (length >= limit) return true;
    at = table[at] ?? -1;
  }
  return false;
}

/** Why `bytes` must not be given to `cfb`, or undefined when it may be. */
export function compoundFileProblem(bytes: Uint8Array): string | undefined {
  const layout = layoutOf(bytes);
  if (typeof layout === 'string') return layout;
  const ids = fatSectors(layout);
  if (typeof ids === 'string') return ids;
  const directory = layout.view.getInt32(0x30, true);
  if (directory < 0 || directory >= layout.sectors)
    return 'the directory sector is outside the file';
  const table = tableOf(layout, ids);
  if (hasLoop(table)) return 'a sector chain loops back on itself';
  return directoryIsTooLarge(layout, table) ? 'the directory is too large' : undefined;
}
