import type { Project } from '../../src/application/projects/project.js';
import {
  WorkbookBatches,
  type BatchFileRequest,
} from '../../src/application/use-cases/workbook-batches.js';
import { MemoryAuditLog } from '../../src/infrastructure/db/memory-audit-log.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakeUploadStore } from './fake-upload-store.js';
import { FakeWorkbookStaging } from './fake-workbook-staging.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { sampleProject } from './project-fixtures.js';

// RF-150, RF-157: the batch use case over memory adapters, a fake staging area and a fake store.

export const amy = { userId: '00000000-0000-4000-9000-0000000000a1', role: 'user' } as const;
export const bob = { userId: '00000000-0000-4000-9000-0000000000b2', role: 'user' } as const;
export const limitBytes = 1000;

export const workbookProject = (overrides: Partial<Project> = {}): Project =>
  sampleProject({
    userId: amy.userId,
    name: 'Pricing',
    sourceKind: 'workbook',
    sourceUrl: '',
    ref: '',
    subpath: '',
    ...overrides,
  });

export interface BatchCase {
  readonly useCase: WorkbookBatches;
  readonly project: Project;
  readonly projects: MemoryProjectRepository;
  readonly staging: FakeWorkbookStaging;
  readonly uploads: FakeUploadStore;
  readonly runs: MemoryRunIndex;
  readonly auditLog: MemoryAuditLog;
  readonly clock: FixedClock;
}

export async function batchCase(project: Project = workbookProject()): Promise<BatchCase> {
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(project);
  const clock = new FixedClock('2026-10-19T08:30:00.000Z');
  const masker = new SecretMasker();
  const staging = new FakeWorkbookStaging();
  const uploads = new FakeUploadStore();
  const runs = new MemoryRunIndex();
  const auditLog = new MemoryAuditLog(masker);
  const useCase = new WorkbookBatches({
    ...{ projects, runs, uploads, staging, auditLog, clock, limitBytes },
    logger: new MemoryLogger(clock, masker),
  });
  return { useCase, project, projects, staging, uploads, runs, auditLog, clock };
}

export function bodyOf(bytes: number): AsyncIterable<Uint8Array> {
  return (async function* () {
    await Promise.resolve();
    yield new Uint8Array(bytes);
  })();
}

export function fileRequest(
  project: Project,
  batchId: string,
  overrides: Partial<BatchFileRequest> = {},
): BatchFileRequest {
  return {
    actor: amy,
    projectId: project.id,
    batchId,
    fileName: encodeURIComponent('Pricing.xlsx'),
    body: bodyOf(100),
    declaredBytes: 100,
    signal: new AbortController().signal,
    ...overrides,
  };
}
