import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { workbookSourceName } from '../../domain/sources/workbook-name.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { UploadStore } from '../ports/upload-store.js';
import type { PublishedWorkbooks } from '../ports/workbook-staging.js';
import type { Project } from '../projects/project.js';
import { pruneEarlier } from '../projects/prune-snapshot.js';
import { recordWorkbooks } from '../projects/record-workbooks.js';
import type { Actor } from '../../domain/accounts/actor.js';
import { bestEffort } from './best-effort.js';
import type { BatchProblem, WorkbookBatchSummary } from './workbook-batch-types.js';

// RF-150: a published snapshot becomes the project's source.

export interface AttachDependencies {
  readonly projects: ProjectRepository;
  readonly runs: Pick<RunIndex, 'list'>;
  readonly uploads: Pick<UploadStore, 'remove' | 'rewriteInfo'>;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
  /** RF-159: how long the attach may take before the batch ends refused; 60 seconds when absent. */
  readonly attachTimeoutMs?: number;
}

export interface Attachment {
  readonly actor: Actor;
  readonly ip: string;
  readonly project: Project;
  readonly published: PublishedWorkbooks;
  readonly uploadedAt: Date;
  /** The batch the snapshot was published for, named in the log of a step that was skipped. */
  readonly batchId?: string | undefined;
}

/** Records the published snapshot as the project's source (RF-150), or removes it when the project is gone. */
export async function attachWorkbooks(
  deps: AttachDependencies,
  input: Attachment,
): Promise<Result<WorkbookBatchSummary, BatchProblem>> {
  const { actor, ip, project, published, uploadedAt, batchId } = input;
  const { projects, uploads } = deps;
  const names = published.info.workbooks.map((book) => book.fileName);
  const attached = await projects.attachUpload({
    userId: project.userId,
    projectId: project.id,
    upload: {
      fileName: workbookSourceName(names),
      uploadedAt: uploadedAt.getTime(),
      snapshotKey: published.key,
      workbooks: names.length,
    },
    updatedAt: uploadedAt.getTime(),
  });
  if (attached === undefined) {
    // The project was deleted while the batch was read: a snapshot this batch created has no owner.
    if (published.created) await uploads.remove(published.key);
    return err(ERROR_CODES.notFound);
  }
  // RF-128: the same content was already stored; now that it is the source, the newest upload names it.
  // RF-159: the source is attached, so a step that fails from here on is logged and skipped.
  const { logger } = deps;
  const context = { projectId: project.id, snapshotKey: published.key, batchId };
  if (!published.created) {
    await bestEffort(logger, 'the rename of the snapshot', context, () =>
      uploads.rewriteInfo(published.key, published.info),
    );
  }
  await bestEffort(logger, 'the removal of the earlier snapshot', context, () =>
    pruneEarlier(deps, project, published.key),
  );
  await bestEffort(logger, 'the audit rows of the workbooks', context, () =>
    recordWorkbooks(deps, {
      ...{ actor, projectId: project.id, ip },
      ...{ snapshotHash: published.info.snapshotHash, workbooks: published.info.workbooks },
    }),
  );
  return ok(summaryOfBatch(project, published, uploadedAt));
}

/** What the page shows after the workbooks became the source (RF-150). */
export function summaryOfBatch(
  project: Project,
  published: PublishedWorkbooks,
  uploadedAt: Date,
): WorkbookBatchSummary {
  return {
    workbooks: published.summary,
    skipped: published.skipped,
    snapshotHash: published.info.snapshotHash,
    uploadedAt: uploadedAt.toISOString(),
    codeChangedSinceLastRun:
      project.lastRunSnapshotKey !== undefined && project.lastRunSnapshotKey !== published.key,
  };
}
