import type { EvaluatedClaim } from '../../domain/eval/claim-match.js';
import type { RunEndState } from '../../domain/runs/run-states.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { Experiment, Results } from './evaluation-schema.js';

// RNF-006, RNF-012, RNF-015, ADR-003, ADR-007, ADR-008: what the evaluation needs from the rest of
// Rosetta. The target runs the real stages (a scan of the golden set's pinned source, the estimate
// and `understand` runs) through the provider factory, so every model call passes the egress and
// budget guards; in tests it answers from a script or replays recordings through the fake provider.

/** The part of the scan's code map the evaluation reads: line counts and areas. */
export interface EvaluationCodeMap {
  readonly files: readonly { readonly path: string; readonly lines: number }[];
  readonly areas: readonly { readonly name: string; readonly files: readonly string[] }[];
}

/** The estimate of an understand run of the chosen areas, in micro-dollars (RF-425). */
export interface EvaluationEstimate {
  readonly likelyMicros: number;
  readonly highMicros: number;
  /** False when a role's model has no price. */
  readonly priced: boolean;
}

/** One ended understand run, as the evaluation scores it. */
export interface EvaluationRun {
  /** The run's folder name. */
  readonly runId: string;
  readonly endState: RunEndState | null;
  readonly errorCode: string | null;
  /** Its manifest: the models, model versions and prompt hashes it used (RNF-004). */
  readonly manifest: RunManifest | undefined;
  /** Every claim of its card files, with its final status. */
  readonly claims: readonly EvaluatedClaim[];
  /** `totals.costMicros` of its `cost.json`; null when it wrote none. */
  readonly costMicros: number | null;
}

export interface EvaluationTarget {
  /** Scans the golden set's pinned source; rejects with a RosettaError when the scan fails. */
  scan(): Promise<EvaluationCodeMap>;
  estimate(areas: readonly string[]): Promise<EvaluationEstimate>;
  /** Runs `understand` on these areas to its end. */
  understand(areas: readonly string[]): Promise<EvaluationRun>;
}

export interface EvaluationFiles {
  /** The folder under `eval-out/`, the experiment's id. */
  readonly folder: string;
  readonly experiment: Experiment;
  readonly results: Results;
}

export interface EvaluationOutput {
  /** Writes `experiment.json` and `results.json`; answers the folder written. */
  write(files: EvaluationFiles): Promise<string>;
}
