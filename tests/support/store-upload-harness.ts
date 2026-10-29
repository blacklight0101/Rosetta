import type { Project } from '../../src/application/projects/project.js';
import { WorkbookBatches } from '../../src/application/use-cases/workbook-batches.js';
import {
  StoreUpload,
  type StoreUploadRequest,
} from '../../src/application/use-cases/store-upload.js';
import { MemoryAuditLog } from '../../src/infrastructure/db/memory-audit-log.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakeUploadStore } from './fake-upload-store.js';
import { FakeWorkbookStaging } from './fake-workbook-staging.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { sampleProject } from './project-fixtures.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-128, RF-133: the Store upload use case over memory adapters and a fake upload store.

export const amy = { userId: '00000000-0000-4000-9000-0000000000a1', role: 'user' } as const;
export const bob = { userId: '00000000-0000-4000-9000-0000000000b2', role: 'user' } as const;
export const limitBytes = 5 * 1024 * 1024;

export const uploadProject = (overrides: Partial<Project> = {}): Project =>
  sampleProject({
    userId: amy.userId,
    name: 'OrderDesk',
    sourceKind: 'upload',
    sourceUrl: '',
    ref: '',
    subpath: '',
    ...overrides,
  });

export interface UploadCase {
  readonly useCase: StoreUpload;
  /** RF-159: where the batch of an accepted zip is held and read. */
  readonly batches: WorkbookBatches;
  readonly project: Project;
  readonly projects: MemoryProjectRepository;
  readonly uploads: FakeUploadStore;
  readonly runs: MemoryRunIndex;
  readonly auditLog: MemoryAuditLog;
  readonly clock: FixedClock;
  /** RF-158: the log of the use case, which a test can make fail. */
  readonly logger: MemoryLogger;
}

export async function setup(project: Project = uploadProject()): Promise<UploadCase> {
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(project);
  const clock = new FixedClock('2026-10-19T08:30:00.000Z');
  const masker = new SecretMasker();
  const uploads = new FakeUploadStore();
  const runs = new MemoryRunIndex();
  const auditLog = new MemoryAuditLog(masker);
  const logger = new MemoryLogger(clock, masker);
  const batches = new WorkbookBatches({
    ...{ projects, runs, uploads, auditLog, clock, limitBytes, logger },
    ...{ staging: new FakeWorkbookStaging(), ids: new SequenceIdGenerator() },
  });
  const useCase = new StoreUpload({
    ...{ projects, runs, uploads, auditLog, clock, limitBytes, batches },
    logger,
  });
  return { useCase, batches, project, projects, uploads, runs, auditLog, clock, logger };
}

export function request(
  project: Project,
  overrides: Partial<StoreUploadRequest> = {},
): StoreUploadRequest {
  return {
    actor: amy,
    projectId: project.id,
    fileName: 'OrderDesk.zip',
    body: (async function* () {
      await Promise.resolve();
      yield new Uint8Array(0);
    })(),
    declaredBytes: 1234,
    ip: '203.0.113.7',
    signal: new AbortController().signal,
    ...overrides,
  };
}
