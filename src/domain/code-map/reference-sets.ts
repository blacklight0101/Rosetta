import { byCodeUnit } from './code-unit-order.js';
import type { FileEntry } from './file-entry.js';

// RF-104: files that a language pack links together (a page and its code-behind) belong in one
// area. This finds those sets with a union-find over the links; nothing here reads a file.

export interface GroupingLink {
  readonly from: string;
  readonly to: string;
}

/** Two or more linked files that fit one area together. */
export interface LinkedSet {
  /** Sorted paths. */
  readonly members: readonly string[];
  /** The smallest path that links to another member; the set joins that file's group. */
  readonly anchor: string;
  readonly estimatedTokens: number;
}

function rootOf(parent: ReadonlyMap<string, string>, path: string): string {
  let root = path;
  for (let next = parent.get(root); next !== undefined && next !== root; next = parent.get(root)) {
    root = next;
  }
  return root;
}

/** Joins the sets of the two paths under the smaller root, so the result never depends on order. */
function join(parent: Map<string, string>, left: string, right: string): void {
  const a = rootOf(parent, left);
  const b = rootOf(parent, right);
  if (a === b) return;
  const [low, high] = byCodeUnit(a, b) < 0 ? [a, b] : [b, a];
  parent.set(high, low);
}

function smaller(current: string | undefined, candidate: string): string {
  return current === undefined || byCodeUnit(candidate, current) < 0 ? candidate : current;
}

/** Sets of linked files whose tokens together stay within `budget`, sorted by first member. */
export function findLinkedSets(
  files: readonly FileEntry[],
  links: readonly GroupingLink[],
  budget: number,
): readonly LinkedSet[] {
  const tokens = new Map(files.map((file) => [file.path, file.estimatedTokens]));
  const usable = links.filter(
    (link) => link.from !== link.to && tokens.has(link.from) && tokens.has(link.to),
  );
  const parent = new Map<string, string>();
  for (const { from, to } of usable) {
    parent.set(from, parent.get(from) ?? from);
    parent.set(to, parent.get(to) ?? to);
    join(parent, from, to);
  }
  const members = new Map<string, Set<string>>();
  const anchors = new Map<string, string>();
  for (const path of parent.keys()) {
    const root = rootOf(parent, path);
    members.set(root, (members.get(root) ?? new Set<string>()).add(path));
  }
  for (const { from } of usable) {
    const root = rootOf(parent, from);
    anchors.set(root, smaller(anchors.get(root), from));
  }
  return [...members.entries()]
    .map(([root, paths]): LinkedSet => {
      const sorted = [...paths].sort(byCodeUnit);
      return {
        members: sorted,
        anchor: anchors.get(root) ?? sorted[0] ?? '',
        estimatedTokens: sorted.reduce((sum, path) => sum + (tokens.get(path) ?? 0), 0),
      };
    })
    .filter((set) => set.estimatedTokens <= budget)
    .sort((a, b) => byCodeUnit(a.members[0] ?? '', b.members[0] ?? ''));
}
