import type { CoverageListing } from '../../api/coverage.js';
import type { CodeAreaInfo } from './code-map-tiles.js';
import type { RunState } from './run-state.js';
import { shareOf } from './run-summary.js';

// RF-1005, RF-230, DEC-51: the coverage map of the live run page. Every area of the run, in plan
// order, with the files of each as a tree of folders and the area's share of all the files read in
// the run. A file is read once a `read_file` call on it succeeded (see `agent-events.ts`) or the
// run's `coverage.json` (the listing) says lines of it were read. The listing also names the files
// not read, so a file or an area nobody read is shown as not read; an area of the code map that has
// no entry yet is listed with the count of its files. Without a listing the map shows the reads.

export interface CoverageNode {
  readonly kind: 'folder' | 'file';
  /** The last segment of the path. */
  readonly name: string;
  /** The path from the repository root. */
  readonly path: string;
  /** Folders first, then files, each by name; empty for a file. */
  readonly children: readonly CoverageNode[];
  /** A file: whether any of its lines were read; a folder: whether any file below it was. */
  readonly read: boolean;
}

export interface AreaCoverage {
  readonly area: string;
  readonly filesRead: number;
  /** Every file the area lists; undefined when the run has not listed them yet. */
  readonly filesTotal: number | undefined;
  /** The area's files read against all the files read in the run, in whole percent. */
  readonly share: number;
  readonly tree: readonly CoverageNode[];
  /** What the run says about the area, for example `not read`; model text. */
  readonly note: string | undefined;
}

export interface CoverageMap {
  readonly areas: readonly AreaCoverage[];
  readonly filesRead: number;
  /** Every file listed; undefined when no area lists its files. */
  readonly filesTotal: number | undefined;
}

/** A folder being built: its sub-folders and files by name. */
interface Branch {
  readonly folders: Map<string, Branch>;
  readonly files: Set<string>;
}

/** The files of one area: all that are known, and those of them that were read. */
interface AreaFiles {
  readonly paths: ReadonlySet<string>;
  readonly read: ReadonlySet<string>;
  readonly total: number | undefined;
  readonly note: string | undefined;
}

const byName = (left: string, right: string): number => left.localeCompare(right, 'en');

function branchOf(paths: Iterable<string>): Branch {
  const root: Branch = { folders: new Map(), files: new Set() };
  for (const path of paths) {
    const segments = path.split('/').filter((segment) => segment !== '');
    const file = segments.pop();
    if (file === undefined) continue;
    let branch = root;
    for (const segment of segments) {
      const next = branch.folders.get(segment) ?? { folders: new Map(), files: new Set() };
      branch.folders.set(segment, next);
      branch = next;
    }
    branch.files.add(file);
  }
  return root;
}

function nodesOf(
  branch: Branch,
  prefix: string,
  read: ReadonlySet<string>,
): readonly CoverageNode[] {
  const folders = [...branch.folders.entries()]
    .sort(([left], [right]) => byName(left, right))
    .map(([name, child]): CoverageNode => {
      const path = `${prefix}${name}`;
      const children = nodesOf(child, `${path}/`, read);
      return { kind: 'folder', name, path, children, read: children.some((node) => node.read) };
    });
  const files = [...branch.files].sort(byName).map((name): CoverageNode => {
    const path = `${prefix}${name}`;
    return { kind: 'file', name, path, children: [], read: read.has(path) };
  });
  return [...folders, ...files];
}

/** The files read per area of the reader agents, areas in plan order, each file once. */
function readsByArea(state: RunState): ReadonlyMap<string, ReadonlySet<string>> {
  const areas = new Map<string, Set<string>>();
  for (const agent of state.agents) {
    if (agent.role !== 'reader' || agent.area === '') continue;
    const files = areas.get(agent.area) ?? new Set<string>();
    for (const path of agent.filesRead) files.add(path);
    areas.set(agent.area, files);
  }
  return areas;
}

/** What the listing and the code map know of an area besides the reads of this page. */
function filesOf(
  reads: ReadonlySet<string>,
  listed: CoverageListing['areas'][number] | undefined,
  known: CodeAreaInfo | undefined,
): AreaFiles {
  const paths = new Set([...reads, ...(listed?.files ?? []).map((file) => file.path)]);
  const read = new Set([
    ...reads,
    ...(listed?.files ?? []).filter((file) => file.read.length > 0).map((file) => file.path),
  ]);
  const total = listed === undefined ? known?.files : paths.size;
  return { paths, read, total, note: listed?.note };
}

/** The area names in order: the run's readers, then the listing's, then the code map's own areas. */
function namesOf(
  reads: ReadonlyMap<string, unknown>,
  listing: CoverageListing | undefined,
  areas: readonly CodeAreaInfo[],
): readonly string[] {
  const listed = (listing?.areas ?? []).map((each) => each.area);
  const own = areas.filter((each) => !each.thirdParty).map((each) => each.name);
  const names = listing === undefined ? [...reads.keys()] : [...reads.keys(), ...listed, ...own];
  return [...new Set(names)];
}

// RF-1005, RF-230
export function coverageOf(
  state: RunState,
  listing?: CoverageListing,
  areas: readonly CodeAreaInfo[] = [],
): CoverageMap {
  const reads = readsByArea(state);
  const files = new Map(
    namesOf(reads, listing, areas).map((name) => [
      name,
      filesOf(
        reads.get(name) ?? new Set<string>(),
        listing?.areas.find((each) => each.area === name),
        areas.find((each) => each.name === name),
      ),
    ]),
  );
  const filesRead = [...files.values()].reduce((sum, each) => sum + each.read.size, 0);
  const totals = [...files.values()].flatMap((each) => each.total ?? []);
  return {
    areas: [...files.entries()].map(([area, each]) => ({
      area,
      filesRead: each.read.size,
      filesTotal: each.total,
      share: shareOf(each.read.size, filesRead),
      tree: nodesOf(branchOf(each.paths), '', each.read),
      note: each.note,
    })),
    filesRead,
    filesTotal: totals.length === 0 ? undefined : totals.reduce((sum, count) => sum + count, 0),
  };
}
