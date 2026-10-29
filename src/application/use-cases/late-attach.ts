import type { Result } from '../../domain/errors/result.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { UploadStore } from '../ports/upload-store.js';
import type { Project } from '../projects/project.js';
import type { UploadSummary } from './upload-summary.js';
import type { WorkbookBatchSummary } from './workbook-batch-types.js';
import { endBatch, type HeldBatch } from './workbook-batch-state.js';

// RF-159, DEC-183, DEC-188: an attach that passed its time limit ended the batch refused (RST-1918), but
// it cannot be stopped and may still land. The project stays busy (RST-1919) until the attach settles,
// and the batch is then corrected from what happened, so a batch never reads refused while its source is
// the snapshot it made.

type BatchSummary = UploadSummary | WorkbookBatchSummary;

export interface LateDependencies {
  readonly projects: ProjectRepository;
  readonly uploads: Pick<UploadStore, 'remove'>;
  readonly logger: Logger;
  readonly clock: Clock;
}

export interface LateAttach<S extends BatchSummary, P> {
  /** The attach and the steps after it, which went on after the limit. */
  readonly attach: Promise<Result<S, P>>;
  readonly project: Project;
  /** The snapshot the batch published, and whether the batch is the one that created it. */
  readonly key: string;
  readonly created: boolean;
  /** The summary of the batch, for when only the project row shows that the attach landed. */
  readonly summary: () => S;
}

/** The attach failed: the project row says whether it landed before it failed. */
async function fromRow<S extends BatchSummary, P>(
  deps: LateDependencies,
  batch: HeldBatch,
  late: LateAttach<S, P>,
): Promise<void> {
  const { userId, id } = late.project;
  const row = await deps.projects.find(userId, id);
  if (row?.upload?.snapshotKey === late.key) {
    endBatch(batch, { kind: 'stored', summary: late.summary() }, deps.clock.now().getTime());
  } else if (late.created) await deps.uploads.remove(late.key);
}

/** Waits for the late attach and corrects the batch from it; it never rejects and frees the project. */
export async function settleLate<S extends BatchSummary, P>(
  deps: LateDependencies,
  batch: HeldBatch,
  late: LateAttach<S, P>,
): Promise<void> {
  try {
    const settled = await late.attach.then(
      (result) => ({ result }),
      () => undefined,
    );
    if (settled === undefined) await fromRow(deps, batch, late);
    else if (settled.result.ok) {
      const outcome = { kind: 'stored', summary: settled.result.value } as const;
      endBatch(batch, outcome, deps.clock.now().getTime());
    }
    // Refused with a reason (the project is gone): the attach already removed what it created.
  } catch (error) {
    await deps.logger
      .log({
        level: 'error',
        logger: 'sources',
        message: 'The end of a late attach could not be settled.',
        data: { batchId: batch.id, reason: error instanceof Error ? error.message : 'unknown' },
      })
      .catch(() => undefined);
  } finally {
    batch.late = undefined;
  }
}
