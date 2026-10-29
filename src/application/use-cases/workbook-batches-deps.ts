import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { UploadStore } from '../ports/upload-store.js';
import type { WorkbookStaging } from '../ports/workbook-staging.js';

// RF-150, RF-159: what the workbook batches are given.

export interface WorkbookBatchesDependencies {
  readonly projects: ProjectRepository;
  readonly runs: Pick<RunIndex, 'list'>;
  readonly uploads: Pick<UploadStore, 'remove' | 'rewriteInfo'>;
  readonly staging: WorkbookStaging;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
  /** `ROSETTA_UPLOAD_MAX_MB` in bytes: the total of one batch. */
  readonly limitBytes: number;
  /** RF-159: how long the attach may take before the batch ends refused; 60 seconds when absent. */
  readonly attachTimeoutMs?: number;
  /** The ids of the batches of a zip, which have no staging folder to name them (RF-159). */
  readonly ids: Pick<IdGenerator, 'uuid'>;
}
