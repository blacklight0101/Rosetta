import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { GoldenSet } from '../../domain/eval/golden-set.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import { experimentOf, type PromptVersion } from './evaluation-experiment.js';
import type {
  EvaluationCodeMap,
  EvaluationFiles,
  EvaluationOutput,
  EvaluationRun,
  EvaluationTarget,
} from './evaluation-ports.js';
import { repetitionResult, resultsOf } from './evaluation-report.js';
import type { Experiment } from './evaluation-schema.js';

// RNF-006, RNF-012, RNF-015, DEC-57, ADR-007, ADR-008: `npm run eval`. It scans the golden set's
// pinned source once, keeps the areas that hold a golden path, estimates an understand run of those
// areas, and runs it at least three times, one after the other, through the target (so every model
// call passes the egress and budget guards). Before any model call it refuses fewer than three
// repetitions, a golden path the code map does not hold, and an evaluation whose high estimate over
// all repetitions passes the total cap. Each run is scored against the golden set; the experiment
// and its results are written together.

export const MIN_REPETITIONS = 3;

export interface RunEvaluationDependencies {
  readonly target: EvaluationTarget;
  readonly output: EvaluationOutput;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly rosettaVersion: string;
  /** Prompt files the runs used that their manifests do not list (the verifier's). */
  readonly extraPrompts: readonly PromptVersion[];
}

export interface RunEvaluationRequest {
  readonly goldenSet: GoldenSet;
  readonly goldenSetSha256: string;
  readonly repetitions: number;
  /** The most all repetitions together may cost, in micro-dollars. */
  readonly totalCapMicros: number;
  /** The settings recorded in `experiment.json` (caps, parallelism, scan settings). */
  readonly settings: Experiment['settings'];
}

export interface EvaluationProblem {
  readonly code: ErrorCode;
  readonly message: string;
}

export interface EvaluationSummary {
  /** Where the files were written. */
  readonly folder: string;
  readonly files: EvaluationFiles;
}

function problem(code: ErrorCode, message: string): Result<never, EvaluationProblem> {
  return err({ code, message });
}

/** The areas that hold a golden path, in code-map order, or the paths the code map lacks. */
function areasFor(golden: GoldenSet, codeMap: EvaluationCodeMap): Result<string[], string[]> {
  const paths = [...new Set(golden.cases.flatMap((entry) => entry.paths))];
  const known = new Set(codeMap.areas.flatMap((area) => area.files));
  const missing = paths.filter((path) => !known.has(path));
  if (missing.length > 0) return err(missing);
  return ok(codeMap.areas.filter((a) => a.files.some((f) => paths.includes(f))).map((a) => a.name));
}

// RNF-006, RNF-012, RNF-015
export class RunEvaluation {
  private readonly deps: RunEvaluationDependencies;

  constructor(deps: RunEvaluationDependencies) {
    this.deps = deps;
  }

  async execute(
    request: RunEvaluationRequest,
  ): Promise<Result<EvaluationSummary, EvaluationProblem>> {
    // P2-11 red step: removed by the feat commit.
    if (request.repetitions >= 0) return problem(ERROR_CODES.unexpected, 'red step');
    if (!Number.isInteger(request.repetitions) || request.repetitions < MIN_REPETITIONS) {
      const message = `An evaluation runs each case at least ${String(MIN_REPETITIONS)} times.`;
      return problem(ERROR_CODES.configurationInvalid, message);
    }
    try {
      return await this.evaluate(request);
    } catch (error) {
      if (!(error instanceof RosettaError)) throw error;
      return problem(error.code, error.message);
    }
  }

  private async evaluate(
    request: RunEvaluationRequest,
  ): Promise<Result<EvaluationSummary, EvaluationProblem>> {
    const { target } = this.deps;
    const codeMap = await target.scan();
    const areas = areasFor(request.goldenSet, codeMap);
    if (!areas.ok) {
      const message = `The code map of the pinned source does not hold these golden paths: ${areas.error.join(', ')}.`;
      return problem(ERROR_CODES.configurationInvalid, message);
    }
    const estimate = await target.estimate(areas.value);
    const worst = estimate.highMicros * request.repetitions;
    if (worst > request.totalCapMicros) {
      const message = `The high estimate of ${String(request.repetitions)} runs, ${String(worst)} micro-dollars, is above the total cap of ${String(request.totalCapMicros)}.`;
      return problem(ERROR_CODES.budgetCapReached, message);
    }
    const runs: EvaluationRun[] = [];
    for (let n = 0; n < request.repetitions; n += 1)
      runs.push(await target.understand(areas.value));
    const lines = new Map(codeMap.files.map((file) => [file.path, file.lines]));
    const input = { golden: request.goldenSet, lines, estimate };
    const repetitions = runs.map((run, index) => repetitionResult(input, run, index + 1));
    return ok(await this.write(request, areas.value, runs, repetitions));
  }

  private async write(
    request: RunEvaluationRequest,
    areas: readonly string[],
    runs: readonly EvaluationRun[],
    repetitions: Parameters<typeof resultsOf>[2],
  ): Promise<EvaluationSummary> {
    const { ids, clock, rosettaVersion, extraPrompts, output } = this.deps;
    const id = ids.runId('eval');
    const experiment = experimentOf({
      ...{ id, at: clock.now().toISOString(), rosettaVersion, golden: request.goldenSet },
      ...{ goldenSetSha256: request.goldenSetSha256, areas, runs, extraPrompts },
      settings: { ...request.settings, totalCapMicros: request.totalCapMicros },
    });
    const files = {
      folder: id,
      experiment,
      results: resultsOf(id, request.goldenSet, repetitions),
    };
    return { folder: await output.write(files), files };
  }
}
