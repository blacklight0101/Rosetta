import type { Result } from '../../domain/errors/result.js';
import type { RunScope } from './run-events.js';

// Architecture section 7 (`ArchiveWriter`), RF-008, RF-1105: zips a run's output folder as a
// stream. The archive is produced while it is read, so a run of any size is never held in memory.

/** `run` is the whole run folder; `handoff` is only its `handoff/` folder (RF-600..RF-699). */
export type ArchivePart = 'run' | 'handoff';

/** The run has no such folder (a run that never wrote one, or no hand-off package yet). */
export type ArchiveRefusal = 'not-found';

export interface ArchiveWriter {
  /**
   * The zip of the part as a byte stream. Entry names are relative to the run folder: the full
   * archive is rooted at `<runKey>/`, the hand-off archive at `handoff/`. Links are never followed
   * and nothing outside the run folder enters the archive. The scope names the owner, so one
   * user's scope never reaches another user's folder.
   */
  archive(
    scope: RunScope,
    part: ArchivePart,
  ): Promise<Result<AsyncIterable<Uint8Array>, ArchiveRefusal>>;
}
