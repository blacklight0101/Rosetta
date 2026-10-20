import type { Actor } from '../../domain/accounts/actor.js';
import type { WorkbookEntry } from '../../domain/sources/source.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';

// RF-157, RF-133: the audit trail of workbooks that became the source of a project. One row for each
// workbook: its name, size and SHA-256 and the hash of the snapshot it went into, never its content.

export interface WorkbookRecording {
  readonly actor: Actor;
  readonly projectId: string;
  readonly ip: string;
  readonly snapshotHash: string;
  readonly workbooks: readonly WorkbookEntry[];
}

// RF-157
export async function recordWorkbooks(
  deps: { readonly auditLog: AuditLog; readonly logger: Logger; readonly clock: Clock },
  recording: WorkbookRecording,
): Promise<void> {
  const { auditLog, logger, clock } = deps;
  const { actor, projectId, snapshotHash, workbooks } = recording;
  for (const book of workbooks) {
    await auditLog.record({
      at: clock.now(),
      actorUserId: actor.userId,
      action: 'source.workbook.uploaded',
      targetType: 'project',
      targetId: projectId,
      ip: recording.ip,
      outcome: 'ok',
      detail: {
        ...{ fileName: book.fileName, size: book.sizeBytes, sha256: book.sha256 },
        snapshotHash,
      },
    });
  }
  await logger.log({
    level: 'info',
    logger: 'sources',
    message: 'Workbooks were stored as the source of a project.',
    userId: actor.userId,
    data: { projectId, workbooks: workbooks.length },
  });
}
