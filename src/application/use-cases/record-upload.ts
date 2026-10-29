import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { StoredUpload } from '../ports/upload-store.js';

// RF-133: the audit row and the log line of a zip stored as the source.

/** The name, size and hash of the zip, never its content. */
export async function recordUpload(
  deps: { readonly auditLog: AuditLog; readonly logger: Logger; readonly clock: Clock },
  input: { readonly userId: string; readonly ip: string; readonly projectId: string },
  stored: StoredUpload,
): Promise<void> {
  const { auditLog, logger, clock } = deps;
  const { userId, ip, projectId } = input;
  await auditLog.record({
    at: clock.now(),
    actorUserId: userId,
    action: 'source.uploaded',
    targetType: 'project',
    targetId: projectId,
    ip,
    outcome: 'ok',
    detail: {
      fileName: stored.info.fileName,
      size: stored.zipBytes,
      keptBytes: stored.info.totalBytes,
      files: stored.info.fileCount,
      snapshotHash: stored.info.snapshotHash,
    },
  });
  await logger.log({
    level: 'info',
    logger: 'sources',
    message: 'A zip was stored as the source of a project.',
    userId,
    data: { projectId, files: stored.info.fileCount, size: stored.zipBytes },
  });
}
