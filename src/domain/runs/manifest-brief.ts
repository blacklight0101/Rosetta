import { err, ok, type Result } from '../errors/result.js';
import type { PlanningBrief } from '../planning/planning-brief.js';
import type { ManifestProblem, RunManifest } from './run-manifest.js';

// RF-604, RNF-004, data-model.md section 3.6: a plan run records the planning brief it is written
// from, beside the catalogue (recordManifestCatalogue) and the prompt versions, so the package can
// be explained and written again from the same input.

/** Records the planning brief of a plan run; refused once the run has ended. */
// RF-604, RNF-004
export function recordManifestBrief(
  manifest: RunManifest,
  brief: PlanningBrief,
): Result<RunManifest, ManifestProblem> {
  if (manifest.endState !== null) return err('already-ended');
  return ok({ ...manifest, brief });
}
