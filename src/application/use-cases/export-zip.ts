import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { ArchivePart, ArchiveWriter } from '../ports/archive-writer.js';
import type { RunIndex } from '../ports/run-index.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-008, RF-1105: Export zip gives the owner of a finished run the zip of its run folder, or of
// only its `handoff/` folder, as a stream. A run that is still queued or running answers
// `in-progress` (the page disables the button; the API answers 409). Another user's run id and an
// unknown id give the same answer, `not-found`, and so does a run without that folder.

export interface ExportZipDependencies {
  readonly runs: RunIndex;
  readonly archives: ArchiveWriter;
}

export interface ZipExport {
  /** A name safe for a `Content-Disposition` header: letters, digits, dots, dashes, underscores. */
  readonly fileName: string;
  readonly body: AsyncIterable<Uint8Array>;
}

export type ExportProblem = 'not-found' | 'in-progress';

// RF-008: `<runKey>.zip` and `<runKey>-handoff.zip`. A run key is made of ids, but the name goes
// into a header, so anything else than the safe characters is replaced all the same.
export function exportFileName(runKey: string, part: ArchivePart): string {
  const safe = runKey.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '_');
  return part === 'handoff' ? `${safe}-handoff.zip` : `${safe}.zip`;
}

export class ExportZip {
  private readonly deps: ExportZipDependencies;

  constructor(deps: ExportZipDependencies) {
    this.deps = deps;
  }

  // RF-008, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
    readonly part: ArchivePart;
  }): Promise<Result<ZipExport, ExportProblem>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    if (run.queueState !== 'Ended') return err('in-progress');
    const archive = await this.deps.archives.archive(scopeOf(run), request.part);
    if (!archive.ok) return err(archive.error);
    return ok({ fileName: exportFileName(run.runKey, request.part), body: archive.value });
  }
}
