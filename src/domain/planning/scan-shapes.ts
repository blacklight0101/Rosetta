import { byCodeUnit } from '../code-map/code-unit-order.js';
import {
  fileKinds,
  unusualNameReasons,
  type Encoding,
  type FileKind,
  type LineEnding,
  type MeasuredFile,
} from './file-facts.js';

// RF-632, DEC-135, ADR-018: the shapes of the legacy repository the package lists in `fixtures.md`,
// from the facts of its files: the largest files, the size by kind, the deepest paths, the unusual
// names, the encodings and the line endings. Every list is in a fixed order and bounded.

const LARGEST = 10;
const DEEPEST = 5;
const REASON_CASE = 'differs from another path only by letter case';

interface KindTotal {
  readonly kind: FileKind;
  readonly files: number;
  readonly bytes: number;
}

interface NamedCount<T extends string> {
  readonly name: T;
  readonly files: number;
}

export interface ScanShapes {
  readonly files: number;
  readonly totalBytes: number;
  /** Files the reader refused; they are not counted anywhere else. */
  readonly unreadable: number;
  /** Files sized but not read, because the total read limit was reached. */
  readonly beyondTotal: number;
  readonly largest: readonly MeasuredFile[];
  readonly byKind: readonly KindTotal[];
  readonly deepest: readonly { readonly path: string; readonly depth: number }[];
  readonly unusualNames: readonly { readonly path: string; readonly reasons: readonly string[] }[];
  readonly encodings: readonly NamedCount<Encoding>[];
  readonly lineEndings: readonly NamedCount<LineEnding>[];
}

function counted<T extends string>(names: readonly (T | undefined)[]): NamedCount<T>[] {
  const counts = new Map<T, number>();
  for (const name of names) if (name !== undefined) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, files]) => ({ name, files }))
    .sort((a, b) => b.files - a.files || byCodeUnit(a.name, b.name));
}

function kindTotals(files: readonly MeasuredFile[]): KindTotal[] {
  return fileKinds.flatMap((kind) => {
    const own = files.filter((file) => file.kind === kind);
    const bytes = own.reduce((sum, file) => sum + file.bytes, 0);
    return own.length === 0 ? [] : [{ kind, files: own.length, bytes }];
  });
}

/** The paths that are the same as another path once letter case is ignored. */
function caseCollisions(paths: readonly string[]): Set<string> {
  const byLower = new Map<string, string[]>();
  for (const path of paths) {
    const key = path.normalize('NFC').toLowerCase();
    byLower.set(key, [...(byLower.get(key) ?? []), path]);
  }
  return new Set([...byLower.values()].filter((same) => same.length > 1).flat());
}

function unusualNames(paths: readonly string[]): ScanShapes['unusualNames'] {
  const collisions = caseCollisions(paths);
  return [...new Set(paths)].sort(byCodeUnit).flatMap((path) => {
    const reasons = [...unusualNameReasons(path), ...(collisions.has(path) ? [REASON_CASE] : [])];
    return reasons.length === 0 ? [] : [{ path, reasons }];
  });
}

// RF-632
export function shapesOf(
  files: readonly MeasuredFile[],
  refusedNames: readonly string[],
  unreadable: number,
  beyondTotal = 0,
): ScanShapes {
  const byPath = [...files].sort((a, b) => byCodeUnit(a.path, b.path));
  const depths = byPath.map((file) => ({ path: file.path, depth: file.path.split('/').length }));
  return {
    files: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    unreadable,
    beyondTotal,
    largest: [...byPath].sort((a, b) => b.bytes - a.bytes).slice(0, LARGEST),
    byKind: kindTotals(files),
    deepest: depths.sort((a, b) => b.depth - a.depth).slice(0, DEEPEST),
    unusualNames: unusualNames([...byPath.map((file) => file.path), ...refusedNames]),
    encodings: counted(files.map((file) => file.encoding)),
    lineEndings: counted(files.map((file) => file.lineEnding)),
  };
}
