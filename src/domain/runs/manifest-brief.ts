import { ok, type Result } from '../errors/result.js';
import type { PlanningBrief } from '../planning/planning-brief.js';
import type { ManifestProblem, RunManifest } from './run-manifest.js';

// RF-604, RNF-004: a plan run records the planning brief it is written from (not built yet).

// RF-604, RNF-004
export const recordManifestBrief: (
  manifest: RunManifest,
  brief: PlanningBrief,
) => Result<RunManifest, ManifestProblem> = (manifest) => ok(manifest);
