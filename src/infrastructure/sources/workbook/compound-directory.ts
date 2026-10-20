import { nextOf, type Layout } from './compound-table.js';

// RF-154: the directory of a compound file, checked before `cfb` arranges it. `cfb` visits every
// entry in a loop that is quadratic in their number and does not notice a tree that loops, and it
// copies the whole chain of every stream, so streams that share sectors are copied once each. Here
// the entries are counted, the tree is walked once with every entry marked, and the sectors of every
// stream are claimed once, so what `cfb` copies can never be more than the file holds.

const ENTRY_BYTES = 128;
const MINI_SECTOR = 64;
const MINI_CUTOFF = 4096;
/** Storages inside storages. */
const MAX_DEPTH = 32;
const NO_STREAM = -1;
const TYPE_FREE = 0;
const TYPE_ROOT = 5;
const MEMBER_TYPES = [TYPE_FREE, 1, 2];

interface Entry {
  readonly type: number;
  readonly left: number;
  readonly right: number;
  readonly child: number;
  readonly start: number;
  readonly size: number;
}

/** The sectors of the directory chain, or a reason when it is longer than `maxEntries` entries. */
function chainOf(layout: Layout, table: Int32Array, maxEntries: number): number[] | string {
  const limit = Math.ceil((maxEntries * ENTRY_BYTES) / layout.sectorSize);
  const chain: number[] = [];
  for (let at = layout.view.getInt32(0x30, true); at >= 0; at = nextOf(table, at)) {
    if (chain.length >= limit) return 'the directory is too large';
    if (at >= layout.sectors) return 'a directory sector is outside the file';
    chain.push(at);
  }
  return chain.length === 0 ? 'the directory chain is empty' : chain;
}

function entriesOf(layout: Layout, chain: readonly number[]): Entry[] {
  const entries: Entry[] = [];
  for (const sector of chain) {
    for (let at = 0; at < layout.sectorSize; at += ENTRY_BYTES) {
      const base = (sector + 1) * layout.sectorSize + at;
      entries.push({
        type: layout.view.getUint8(base + 0x42),
        left: layout.view.getInt32(base + 0x44, true),
        right: layout.view.getInt32(base + 0x48, true),
        child: layout.view.getInt32(base + 0x4c, true),
        start: layout.view.getInt32(base + 0x74, true),
        size: layout.view.getUint32(base + 0x78, true),
      });
    }
  }
  return entries;
}

function pointersOf(entry: Entry): number[] {
  return [entry.left, entry.right, entry.child];
}

function edgeProblem(target: number, reached: Uint8Array, depth: number): string | undefined {
  if (target < 0 || target >= reached.length)
    return 'a directory entry points outside the directory';
  if (reached[target] !== 0) return 'a directory entry is reached twice (the tree loops)';
  return depth > MAX_DEPTH ? 'the directory is nested too deep' : undefined;
}

function typeProblem(entries: readonly Entry[]): string | undefined {
  if (entries[0]?.type !== TYPE_ROOT) return 'the first directory entry is not the root';
  return entries.slice(1).some((entry) => !MEMBER_TYPES.includes(entry.type))
    ? 'a directory entry has a type that is neither a storage nor a stream'
    : undefined;
}

/** Walks the tree from the root; every entry is reached once and nothing deeper than the limit. */
function treeProblem(entries: readonly Entry[]): string | undefined {
  const typed = typeProblem(entries);
  if (typed !== undefined) return typed;
  const reached = new Uint8Array(entries.length);
  reached[0] = 1;
  const pending: { index: number; depth: number }[] = [{ index: 0, depth: 0 }];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const entry = entries[next.index];
    for (const [slot, target] of (entry === undefined ? [] : pointersOf(entry)).entries()) {
      if (target === NO_STREAM) continue;
      const depth = next.depth + (slot === 2 ? 1 : 0);
      const problem = edgeProblem(target, reached, depth);
      if (problem !== undefined) return problem;
      reached[target] = 1;
      pending.push({ index: target, depth });
    }
  }
  return entries.some((entry, index) => reached[index] === 0 && !isBlank(entry))
    ? 'a directory entry hangs outside the tree'
    : undefined;
}

function isBlank(entry: Entry): boolean {
  return entry.type === TYPE_FREE && pointersOf(entry).every((pointer) => pointer === NO_STREAM);
}

/** The sectors that belong to a chain, claimed once. */
class Claims {
  private readonly owned: Uint8Array;
  private readonly table: Int32Array;

  constructor(table: Int32Array) {
    this.table = table;
    this.owned = new Uint8Array(table.length);
  }

  /** Claims a whole chain; false when one of its sectors already belongs to another. */
  chain(start: number): boolean {
    for (let at = start; at >= 0 && at < this.table.length; at = nextOf(this.table, at)) {
      if (this.owned[at] !== 0) return false;
      this.owned[at] = 1;
    }
    return true;
  }
}

/** The mini allocation table: the entries of the mini FAT sectors, which `cfb` reads by number. */
function miniTableOf(layout: Layout, table: Int32Array): Int32Array {
  const sectors: number[] = [];
  const count = layout.view.getUint32(0x40, true);
  let at = layout.view.getInt32(0x3c, true);
  for (let i = 0; i < count && at >= 0 && at < layout.sectors; i++, at = nextOf(table, at)) {
    sectors.push(at);
  }
  const perSector = layout.sectorSize / 4;
  const mini = new Int32Array(sectors.length * perSector);
  for (const [index, sector] of sectors.entries()) {
    for (let slot = 0; slot < perSector; slot++) {
      const from = (sector + 1) * layout.sectorSize + slot * 4;
      mini[index * perSector + slot] = layout.view.getInt32(from, true);
    }
  }
  return mini;
}

/** Claims the mini sectors of one short stream; false when another stream already holds one. */
function claimMini(owned: Uint8Array, miniTable: Int32Array, entry: Entry): boolean {
  let at = entry.start;
  for (let left = entry.size; left > 0 && at >= 0 && at < miniTable.length; left -= MINI_SECTOR) {
    if (owned[at] !== 0) return false;
    owned[at] = 1;
    at = miniTable[at] ?? -1;
  }
  return true;
}

interface Directory {
  readonly layout: Layout;
  readonly table: Int32Array;
  readonly entries: readonly Entry[];
  readonly chain: readonly number[];
  readonly fileBytes: number;
}

/** The chains the header names: the directory, the mini FAT and the mini stream. */
function fixedStarts(directory: Directory): number[] {
  const { layout, entries, chain } = directory;
  const starts = [chain[0] ?? -1];
  if (layout.view.getUint32(0x40, true) > 0) starts.push(layout.view.getInt32(0x3c, true));
  const root = entries[0];
  if (root !== undefined && root.size > 0) starts.push(root.start);
  return starts;
}

function streamsProblem(directory: Directory): string | undefined {
  const { layout, table, entries, fileBytes } = directory;
  const claims = new Claims(table);
  if (!fixedStarts(directory).every((start) => claims.chain(start))) {
    return 'the directory, the mini FAT and the mini stream share sectors';
  }
  const miniTable = miniTableOf(layout, table);
  const miniOwned = new Uint8Array(miniTable.length);
  let declared = 0;
  for (const entry of entries.slice(1)) {
    declared += entry.size;
    if (entry.size > fileBytes || declared > fileBytes) {
      return 'the streams declare more bytes than the file holds';
    }
    const free =
      entry.size >= MINI_CUTOFF
        ? claims.chain(entry.start)
        : claimMini(miniOwned, miniTable, entry);
    if (!free) return 'two streams share a sector';
  }
  return undefined;
}

/** Why the directory of the file must not be given to `cfb`, or undefined. */
export function directoryProblem(
  layout: Layout,
  table: Int32Array,
  fileBytes: number,
  maxEntries: number,
): string | undefined {
  const chain = chainOf(layout, table, maxEntries);
  if (typeof chain === 'string') return chain;
  const entries = entriesOf(layout, chain);
  return treeProblem(entries) ?? streamsProblem({ layout, table, entries, chain, fileBytes });
}
