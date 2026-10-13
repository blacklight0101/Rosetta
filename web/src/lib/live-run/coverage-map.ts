import type { RunState } from './run-state.js';
import { shareOf } from './run-summary.js';

// RF-1005, DEC-51: the coverage map of the live run page. Every reader agent's area, in plan order,
// with the files its agents have read so far (a `read_file` call that succeeded, see
// `agent-events.ts`) as a tree of folders, and the area's share of all the files read in the run.
// The events do not name the files of an area that were not read, so the map shows what was read.

export interface CoverageNode {
  readonly kind: 'folder' | 'file';
  /** The last segment of the path. */
  readonly name: string;
  /** The path from the repository root. */
  readonly path: string;
  /** Folders first, then files, each by name; empty for a file. */
  readonly children: readonly CoverageNode[];
}

export interface AreaCoverage {
  readonly area: string;
  readonly filesRead: number;
  /** The area's files read against all the files read in the run, in whole percent. */
  readonly share: number;
  readonly tree: readonly CoverageNode[];
}

export interface CoverageMap {
  readonly areas: readonly AreaCoverage[];
  readonly filesRead: number;
}

/** A folder being built: its sub-folders and files by name. */
interface Branch {
  readonly folders: Map<string, Branch>;
  readonly files: Set<string>;
}

const byName = (left: string, right: string): number => left.localeCompare(right, 'en');

function branchOf(paths: readonly string[]): Branch {
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

function nodesOf(branch: Branch, prefix: string): readonly CoverageNode[] {
  const folders = [...branch.folders.entries()]
    .sort(([left], [right]) => byName(left, right))
    .map(([name, child]): CoverageNode => {
      const path = `${prefix}${name}`;
      return { kind: 'folder', name, path, children: nodesOf(child, `${path}/`) };
    });
  const files = [...branch.files]
    .sort(byName)
    .map((name): CoverageNode => ({ kind: 'file', name, path: `${prefix}${name}`, children: [] }));
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

// RF-1005
export function coverageOf(state: RunState): CoverageMap {
  const reads = readsByArea(state);
  const filesRead = [...reads.values()].reduce((sum, files) => sum + files.size, 0);
  const areas = [...reads.entries()].map(([area, files]) => ({
    area,
    filesRead: files.size,
    share: shareOf(files.size, filesRead),
    tree: nodesOf(branchOf([...files]), ''),
  }));
  return { areas, filesRead };
}
