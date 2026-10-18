import { canDeepen, newDeepenRecord, reopenedDeepen } from '../../domain/deepen/deepen-record.js';
import type { DeepenRecord } from '../../domain/deepen/deepen-record.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { scopeOf } from '../runs/run-scope.js';
import { measuresOf, type DeepenState } from './deepen-state.js';
import type { DeepenParts } from './deepen-parts.js';

// RF-209, RF-006, RNF-004: where a Deepen run starts. A new one copies the task results of the
// completed run it improves (its cards, claim statuses and coverage), which stays as it was; a
// resumed one goes on from its own. The completed run must be the user's, still `Completed`, and
// read from the code map of the latest scan, or its citations would point at other lines.

export interface DeepenSeed {
  readonly state: DeepenState;
  readonly record: DeepenRecord;
}

// RF-209, RF-006
export async function seedDeepen(parts: DeepenParts): Promise<Result<DeepenSeed, ErrorCode>> {
  const { execution, deps, request, scanned } = parts;
  const { run } = execution;
  const parent = await deps.runs.find(run.userId, request.parentRunId);
  if (parent === undefined) return err(ERROR_CODES.notFound);
  if (!canDeepen(parent)) return err(ERROR_CODES.runNotDeepenable);
  const parentManifest = await deps.manifests.read(scopeOf(parent));
  if (parentManifest?.codemapHash !== scanned.codeMapHash) {
    return err(ERROR_CODES.resumeSourceChanged);
  }
  const own = await deps.taskResults.read(scopeOf(run));
  const results = own.length > 0 ? own : await deps.taskResults.read(scopeOf(parent));
  if (results.length === 0) return err(ERROR_CODES.taskResultsUnreadable);
  const state = { results };
  const stored = execution.manifest.deepen;
  const record =
    stored === undefined
      ? newDeepenRecord(
          { ...request, parentRunKey: parent.runKey },
          measuresOf(state, scanned.codeMap),
        )
      : reopenedDeepen(stored);
  return ok({ state, record });
}
