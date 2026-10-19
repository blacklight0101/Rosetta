import type { Run } from '../../domain/runs/run.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { ResolvedSource } from '../ports/run-executor.js';

// RF-130, RF-131, RNF-004: the source a plan run records as its own, the one of the understand run it
// is written from. A GitHub run has a commit; an upload run has none and names its zip. Undefined
// while the source run recorded no snapshot or no hash.

/** The source of a plan run from the row and the manifest of its source run. */
export function resolvedSourceOf(
  sourceRun: Pick<Run, 'commitSha' | 'snapshotKey'>,
  manifest: RunManifest | undefined,
): ResolvedSource | undefined {
  const { commitSha, snapshotKey } = sourceRun;
  const snapshotHash = manifest?.source.snapshotHash ?? null;
  if (snapshotKey === null || snapshotHash === null) return undefined;
  const { fileName, uploadedAt } = manifest?.source ?? {};
  return {
    ...{ commitSha, snapshotKey, snapshotHash },
    ...(fileName === undefined || uploadedAt === undefined ? {} : { fileName, uploadedAt }),
  };
}
