import type { Actor } from '../../domain/accounts/actor.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { ArchivePart, ArchiveWriter } from '../ports/archive-writer.js';
import type { RunIndex } from '../ports/run-index.js';

export interface ExportZipDependencies {
  readonly runs: RunIndex;
  readonly archives: ArchiveWriter;
}

export interface ZipExport {
  readonly fileName: string;
  readonly body: AsyncIterable<Uint8Array>;
}

export type ExportProblem = 'not-found' | 'in-progress';

export function exportFileName(runKey: string, part: ArchivePart): string {
  return `${runKey}-${part}.zip`;
}

export class ExportZip {
  private readonly deps: ExportZipDependencies;

  constructor(deps: ExportZipDependencies) {
    this.deps = deps;
  }

  execute(_request: {
    readonly actor: Actor;
    readonly runId: string;
    readonly part: ArchivePart;
  }): Promise<Result<ZipExport, ExportProblem>> {
    void this.deps;
    return Promise.resolve(err('not-found'));
  }
}
