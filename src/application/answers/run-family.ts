import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-646, DEC-179: an understand run and the Deepens linked to it are one family: the Deepens are the
// understand runs whose manifest names the run they improve (a Deepen of a Deepen belongs to the
// family of the first run). The questions of the family form the one list of the project.

export interface FamilyDependencies {
  readonly runs: Pick<RunIndex, 'list'>;
  readonly manifests: Pick<RunManifestStore, 'read'>;
}

/** For callers that cannot read manifests: every run is its own family. */
export const noManifests: Pick<RunManifestStore, 'read'> = {
  read: () => Promise.resolve(undefined),
};

export interface RunFamily {
  /** The family's runs, the first understand run first, then the Deepens in the order they were queued. */
  readonly runs: readonly Run[];
  /** How many of them are Deepens. */
  readonly deepens: number;
  /** The run asked about is a Deepen. */
  readonly isDeepen: boolean;
}

/** The run a queued Deepen names in its options before its manifest holds the record. */
function optionParent(options: unknown): string | undefined {
  if (typeof options !== 'object' || options === null || !('parentRunId' in options)) {
    return undefined;
  }
  return typeof options.parentRunId === 'string' ? options.parentRunId : undefined;
}

/** The id of the run a run improves; undefined for a run that is not a Deepen or whose manifest is unreadable. */
async function parentIdOf(
  manifests: Pick<RunManifestStore, 'read'>,
  run: Run,
): Promise<string | undefined> {
  try {
    const manifest = await manifests.read(scopeOf(run));
    return manifest?.deepen?.parentRunId ?? optionParent(manifest?.options['deepen']);
  } catch (error) {
    if (error instanceof RosettaError) return undefined;
    throw error;
  }
}

// RF-646
export async function familyOf(deps: FamilyDependencies, run: Run): Promise<RunFamily> {
  const understand = (await deps.runs.list(run.userId, run.projectId)).filter(
    (each) => each.stage === 'understand',
  );
  const parents = new Map<string, string | undefined>(
    await Promise.all(
      understand.map(async (each) => [each.id, await parentIdOf(deps.manifests, each)] as const),
    ),
  );
  const rootOf = (id: string): string => {
    const seen = new Set<string>();
    let current = id;
    for (;;) {
      const parent = parents.get(current);
      if (parent === undefined || !parents.has(parent) || seen.has(parent)) return current;
      seen.add(current);
      current = parent;
    }
  };
  const root = rootOf(run.id);
  const members = understand
    .filter((each) => rootOf(each.id) === root)
    .sort((a, b) => a.queuedAt - b.queuedAt || a.runKey.localeCompare(b.runKey));
  const first = members.find((each) => each.id === root);
  const runs = first === undefined ? members : [first, ...members.filter((each) => each !== first)];
  return {
    runs: runs.length === 0 ? [run] : runs,
    deepens: Math.max(runs.length - 1, 0),
    isDeepen: root !== run.id,
  };
}
