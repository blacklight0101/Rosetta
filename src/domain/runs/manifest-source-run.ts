import { err, ok, type Result } from '../errors/result.js';
import type { ManifestProblem, RunManifest } from './run-manifest.js';

// RF-614, RNF-004, data-model.md section 3.6: a plan run records the understand run it was written
// from (its folder name), so the package can be traced to the cards and answers it used and the
// estimate and the package can be shown to use the same run.

/** Records the source understand run of a plan run; refused once the run has ended. */
// RF-614, RNF-004
export function recordManifestSourceRun(
  manifest: RunManifest,
  sourceRunId: string,
): Result<RunManifest, ManifestProblem> {
  if (manifest.endState !== null) return err('already-ended');
  return ok({ ...manifest, sourceRunId });
}
