import { err, ok, type Result } from '../errors/result.js';
import { createArea, type Area, type AreaOrigin, type AreaProblem } from './area.js';
import { byCodeUnit } from './code-unit-order.js';
import type { FileEntry } from './file-entry.js';
import { folderBuckets } from './folder-buckets.js';
import { findLinkedSets, type GroupingLink } from './reference-sets.js';

// RF-104: files are grouped by folder and, where a language pack links files, by those links; a
// group over the token budget is split; areas from the settings replace the automatic grouping for
// the files they match. Pure and deterministic: the result does not depend on the input order.

export interface ConfiguredArea {
  readonly name: string;
  /** True for a repository-relative path that belongs to this area. */
  matches(path: string): boolean;
}

export interface GroupingInput {
  readonly files: readonly FileEntry[];
  readonly links: readonly GroupingLink[];
  /** `scan.areaTokenBudget`. */
  readonly areaTokenBudget: number;
  /** In the order of the settings; a file goes to the first area that matches it. */
  readonly configured: readonly ConfiguredArea[];
}

export type GroupingProblem = AreaProblem | 'duplicate-configured-area';

/** Files that must stay in one area: a linked set, or a single file. */
interface Unit {
  readonly key: string;
  readonly files: readonly FileEntry[];
  readonly tokens: number;
  /** True when the unit joined files of several folders. */
  readonly crossFolder: boolean;
}

interface Draft {
  readonly name: string;
  readonly origin: AreaOrigin;
  readonly units: readonly Unit[];
}

const byPath = (a: FileEntry, b: FileEntry): number => byCodeUnit(a.path, b.path);

function unitOf(files: readonly FileEntry[], crossFolder: boolean): Unit {
  const sorted = [...files].sort(byPath);
  return {
    key: sorted[0]?.path ?? '',
    files: sorted,
    tokens: sorted.reduce((sum, file) => sum + file.estimatedTokens, 0),
    crossFolder,
  };
}

/** Splits `units` (sorted by key) into runs whose tokens stay within the budget where possible. */
function chunk(units: readonly Unit[], budget: number): Unit[][] {
  const runs: Unit[][] = [];
  let tokens = 0;
  for (const unit of [...units].sort((a, b) => byCodeUnit(a.key, b.key))) {
    const current = runs[runs.length - 1];
    if (current !== undefined && tokens + unit.tokens <= budget) {
      current.push(unit);
      tokens += unit.tokens;
    } else {
      runs.push([unit]);
      tokens = unit.tokens;
    }
  }
  return runs;
}

function areasOf(draft: Draft, budget: number): Result<Area[], AreaProblem> {
  const runs = chunk(draft.units, budget);
  const areas: Area[] = [];
  for (const [index, run] of runs.entries()) {
    const made = createArea(
      {
        name: runs.length > 1 ? `${draft.name}#${String(index + 1)}` : draft.name,
        origin: run.some((unit) => unit.crossFolder) ? 'references' : draft.origin,
        members: run.flatMap((unit) => unit.files),
      },
      budget,
    );
    if (!made.ok) return made;
    areas.push(made.value);
  }
  return ok(areas);
}

/** Automatic groups: folder buckets, then linked sets pulled into the group of their anchor. */
function automaticDrafts(
  files: readonly FileEntry[],
  links: readonly GroupingLink[],
  budget: number,
): Draft[] {
  const buckets = folderBuckets(files, budget);
  const bucketOf = new Map<string, number>();
  buckets.forEach((bucket, index) => {
    for (const file of bucket.files) bucketOf.set(file.path, index);
  });
  const byPathMap = new Map(files.map((file) => [file.path, file]));
  const units = buckets.map(() => new Map<string, Unit>());
  const grouped = new Set<string>();
  for (const set of findLinkedSets(files, links, budget)) {
    const members = set.members.flatMap((path) => byPathMap.get(path) ?? []);
    const home = bucketOf.get(set.anchor) ?? bucketOf.get(set.members[0] ?? '') ?? 0;
    const spread = new Set(set.members.map((path) => bucketOf.get(path))).size > 1;
    const unit = unitOf(members, spread);
    units[spread ? home : (bucketOf.get(unit.key) ?? home)]?.set(unit.key, unit);
    for (const path of set.members) grouped.add(path);
  }
  buckets.forEach((bucket, index) => {
    for (const file of bucket.files) {
      if (!grouped.has(file.path)) units[index]?.set(file.path, unitOf([file], false));
    }
  });
  return buckets.map((bucket, index) => ({
    name: bucket.name,
    origin: 'folder',
    units: [...(units[index]?.values() ?? [])],
  }));
}

function configuredDrafts(
  files: readonly FileEntry[],
  configured: readonly ConfiguredArea[],
): { readonly drafts: Draft[]; readonly rest: FileEntry[] } {
  const taken = new Map<string, FileEntry[]>();
  const rest: FileEntry[] = [];
  for (const file of files) {
    const owner = configured.find((area) => area.matches(file.path));
    if (owner === undefined) {
      rest.push(file);
    } else {
      const list = taken.get(owner.name);
      if (list === undefined) taken.set(owner.name, [file]);
      else list.push(file);
    }
  }
  const drafts = configured.flatMap((area): Draft[] => {
    const members = taken.get(area.name);
    if (members === undefined) return [];
    return [
      { name: area.name, origin: 'config', units: members.map((file) => unitOf([file], false)) },
    ];
  });
  return { drafts, rest };
}

/** An automatic name that a configured area already uses gets ` (auto)` until it is free. */
function withFreeNames(drafts: readonly Draft[], taken: ReadonlySet<string>): Draft[] {
  const used = new Set(taken);
  return drafts.map((draft) => {
    let name = draft.name;
    while (used.has(name)) name = `${name} (auto)`;
    used.add(name);
    return { ...draft, name };
  });
}

/**
 * RF-104: groups the files of a scan into areas. Throws nothing; returns a problem for a budget
 * that is not a positive whole number or two configured areas with one name.
 */
export function groupIntoAreas(input: GroupingInput): Result<readonly Area[], GroupingProblem> {
  const budget = input.areaTokenBudget;
  if (!Number.isInteger(budget) || budget < 1) return err('invalid-budget');
  const names = input.configured.map((area) => area.name);
  if (new Set(names).size !== names.length) return err('duplicate-configured-area');
  const files = [...input.files].sort(byPath);
  const { drafts: fromSettings, rest } = configuredDrafts(files, input.configured);
  const automatic = withFreeNames(automaticDrafts(rest, input.links, budget), new Set(names));
  const areas: Area[] = [];
  for (const draft of [...fromSettings, ...automatic]) {
    const made = areasOf(draft, budget);
    if (!made.ok) return made;
    areas.push(...made.value);
  }
  return ok(areas.sort((a, b) => byCodeUnit(a.name, b.name)));
}
