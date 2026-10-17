import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { measureAgreement, type CalibrationOutcome } from '../../domain/eval/verifier-agreement.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import { readCitedLines } from '../verifier/cited-lines.js';
import {
  CAP_UNVERIFIED_REASON,
  judgeClaim,
  type ClaimJudgeParts,
} from '../verifier/judge-claim.js';
import { verifierPromptVersions, type VerifierPrompts } from '../verifier/verifier-prompts.js';
import type {
  CalibrationModelResult,
  CalibrationOutput,
  CalibrationResults,
} from './calibration-results.js';
import type { CalibrationClaim, CalibrationSet } from './calibration-set-schema.js';

// RF-305, DEC-57, ADR-005, ADR-007, ADR-008: `npm run eval -- --calibration`. Every claim of the
// hand-labelled set is judged by the `verifier` role of each chosen model, one after the other,
// exactly as the judgement step of a run judges a claim (`judgeClaim`: the claim and only its cited
// lines as data, the reason before the verdict, one retry, the guards of the provider factory). The
// verdicts are compared with the labels (`measureAgreement`) and written to `calibration.json`.
// Before any model call the cited lines are read from the source, so a set that cites lines the
// source does not hold is refused without cost. A model whose cap is reached, or a run that is
// stopped, leaves the claims not yet judged `Unverified`; they count as disagreements, so the rate
// of a model that could not finish is never better than its answers.

export interface CalibrationModel {
  readonly provider: string;
  readonly model: string;
  /** The judging parts of the model's `verifier` role; `onAnswer` is set by the use case. */
  readonly judge: Omit<ClaimJudgeParts, 'onAnswer'>;
}

export interface RunCalibrationDependencies {
  readonly output: CalibrationOutput;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly rosettaVersion: string;
  /** The prompts the verifier role uses, recorded with their SHA-256 (RNF-004). */
  readonly prompts: VerifierPrompts;
}

export interface RunCalibrationRequest {
  readonly set: CalibrationSet;
  readonly setSha256: string;
  readonly models: readonly CalibrationModel[];
}

export interface CalibrationProblem {
  readonly code: ErrorCode;
  readonly message: string;
  /** The results of a calibration that was paid for but could not be written. */
  readonly results?: CalibrationResults;
}

export interface CalibrationSummary {
  /** Where `calibration.json` was written. */
  readonly folder: string;
  readonly results: CalibrationResults;
}

const STOPPED_REASON = 'The calibration was stopped before the claim was judged.';

function problem(code: ErrorCode, message: string): Result<never, CalibrationProblem> {
  return err({ code, message });
}

/** The span of a claim's calls: the trace prefix, `f` and the claim's number in hex. */
function spanIdOf(traceId: string, index: number): string {
  return `${traceId.slice(0, 12)}f${(index + 1).toString(16).padStart(3, '0').slice(-3)}`;
}

/** Why a claim's cited lines cannot be read from the source; none when all can be. */
async function unreadable(
  model: CalibrationModel,
  claims: readonly CalibrationClaim[],
): Promise<string[]> {
  const { reader, limits } = model.judge;
  const problems: string[] = [];
  for (const claim of claims) {
    const read = await readCitedLines(reader, claim.citations, limits);
    if (!read.ok) problems.push(`${claim.id}: ${read.error}`);
  }
  return problems;
}

type EndState = CalibrationModelResult['endState'];

/** How the model's run ends when a claim gets no verdict, and the reason the claim carries. */
function stopOf(kind: 'capped' | 'stopped'): { endState: EndState; reason: string } {
  return kind === 'capped'
    ? { endState: 'CapReached', reason: CAP_UNVERIFIED_REASON }
    : { endState: 'Stopped', reason: STOPPED_REASON };
}

type Stop = ReturnType<typeof stopOf>;

interface Step {
  readonly outcome: CalibrationOutcome;
  readonly stop: Stop | undefined;
}

/** One claim: judged, or left `Unverified` when the model's run has already stopped or stops now. */
async function judgeStep(
  parts: ClaimJudgeParts,
  claim: CalibrationClaim,
  index: number,
  stop: Stop | undefined,
): Promise<Step> {
  const label = claim.supported ? 'Supported' : 'Rejected';
  const unverified = (by: Stop): CalibrationOutcome => ({
    ...{ claimId: claim.id, label, verdict: 'Unverified' },
    reason: by.reason,
  });
  if (stop !== undefined) return { outcome: unverified(stop), stop };
  const judged = { claimId: claim.id, text: claim.text, citations: claim.citations };
  const judgement = await judgeClaim(parts, judged, spanIdOf(parts.call.traceId, index));
  if (judgement.kind === 'judged') {
    const { status: verdict, reason } = judgement;
    return { outcome: { claimId: claim.id, label, verdict, reason }, stop };
  }
  const next = stopOf(judgement.kind);
  return { outcome: unverified(next), stop: next };
}

/** One model judges every claim in order; claims left over after a stop are `Unverified`. */
async function judgeAll(
  model: CalibrationModel,
  claims: readonly CalibrationClaim[],
): Promise<CalibrationModelResult> {
  let modelVersion: string | null = null;
  const parts: ClaimJudgeParts = {
    ...model.judge,
    onAnswer: (response) => {
      modelVersion = response.modelVersion;
      return Promise.resolve();
    },
  };
  const outcomes: CalibrationOutcome[] = [];
  let stop: Stop | undefined;
  for (const [index, claim] of claims.entries()) {
    const step = await judgeStep(parts, claim, index, stop);
    outcomes.push(step.outcome);
    stop = step.stop;
  }
  const { rate, ...agreement } = measureAgreement(outcomes);
  const { provider, model: name } = model;
  const endState = stop?.endState ?? 'Completed';
  const disagreements = [...agreement.disagreements];
  return {
    provider,
    model: name,
    modelVersion,
    endState,
    ...agreement,
    disagreements,
    agreementRate: rate,
  };
}

// RF-305
export class RunCalibration {
  private readonly deps: RunCalibrationDependencies;

  constructor(deps: RunCalibrationDependencies) {
    this.deps = deps;
  }

  async execute(
    request: RunCalibrationRequest,
  ): Promise<Result<CalibrationSummary, CalibrationProblem>> {
    const [first] = request.models;
    if (first === undefined) {
      return problem(ERROR_CODES.configurationInvalid, 'No model to calibrate.');
    }
    const missing = await unreadable(first, request.set.claims);
    if (missing.length > 0) {
      const message = `The calibration set cites lines its source does not give: ${missing.join('; ')}`;
      return problem(ERROR_CODES.configurationInvalid, message);
    }
    const models: CalibrationModelResult[] = [];
    for (const model of request.models) models.push(await judgeAll(model, request.set.claims));
    return this.write(request, models);
  }

  private resultsOf(
    request: RunCalibrationRequest,
    models: CalibrationResults['models'],
  ): CalibrationResults {
    const { ids, clock, rosettaVersion, prompts } = this.deps;
    return {
      ...{ schemaVersion: 1, id: ids.runId('calibration'), at: clock.now().toISOString() },
      ...{ rosettaVersion, calibrationSetVersion: request.set.version },
      ...{ calibrationSetSha256: request.setSha256, claims: request.set.claims.length },
      promptVersions: verifierPromptVersions(prompts),
      models,
    };
  }

  /** The calls were paid for, so a folder that cannot be written is tried once more under a new id. */
  private async write(
    request: RunCalibrationRequest,
    models: CalibrationResults['models'],
  ): Promise<Result<CalibrationSummary, CalibrationProblem>> {
    let results = this.resultsOf(request, models);
    try {
      return ok({ folder: await this.deps.output.write(results), results });
    } catch {
      results = this.resultsOf(request, models);
    }
    try {
      return ok({ folder: await this.deps.output.write(results), results });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const message = `The results could not be written: ${reason}`;
      return err({ code: ERROR_CODES.reportWriteFailed, message, results });
    }
  }
}
