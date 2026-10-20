import type { RunIndex } from '../ports/run-index.js';
import type { UploadStore } from '../ports/upload-store.js';
import type { Project } from './project.js';

// RF-128, RF-150: when a source is uploaded again, the snapshot it replaces goes unless a run uses it
// or may still read the source. Earlier runs keep the snapshot they analysed.

/** Deletes the snapshot the project held before `newKey`, when nothing needs it. */
export async function pruneEarlier(
  deps: { readonly runs: Pick<RunIndex, 'list'>; readonly uploads: Pick<UploadStore, 'remove'> },
  project: Project,
  newKey: string,
): Promise<void> {
  const earlier = project.upload?.snapshotKey;
  if (earlier === undefined || earlier === newKey) return;
  const runs = await deps.runs.list(project.userId, project.id);
  if (runs.some((run) => run.queueState !== 'Ended' || run.snapshotKey === earlier)) return;
  await deps.uploads.remove(earlier);
}
