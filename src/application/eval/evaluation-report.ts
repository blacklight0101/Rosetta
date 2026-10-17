import { citationValidity } from '../../domain/eval/citation-validity.js';
import { scoreCase, scoreClaims } from '../../domain/eval/claim-score.js';
import { ESTIMATE_TOLERANCE, estimateAccuracy } from '../../domain/eval/estimate-accuracy.js';
import type { GoldenSet } from '../../domain/eval/golden-set.js';
import { rounded } from '../../domain/eval/ratio.js';
import { spreadOf, type Spread } from '../../domain/eval/spread.js';
import type { EvaluationEstimate, EvaluationRun } from './evaluation-ports.js';
import type { RepetitionResult, Results } from './evaluation-schema.js';

// RNF-006, RNF-012, RNF-015, RFC-001 section 7: `results.json` from the scored repetitions: each
// repetition's scores overall and per case, its citation validity, cost and estimate accuracy;
// the spread of every measure across repetitions; and the targets of RFC-001 section 7, met when
// the mean reaches them (precision 90%, rule recall 70%, citation validity 100%, estimate 30%).

const TARGETS = { precision: 0.9, recall: 0.7, citationValidity: 1 } as const;

export interface ScoringInput {
  readonly golden: GoldenSet;
  readonly lines: ReadonlyMap<string, number>;
  readonly estimate: EvaluationEstimate;
}

function perClaim(cost: number | null, supported: number): number | null {
  return cost === null || supported === 0 ? null : rounded(cost / supported);
}

function versionsOf(run: EvaluationRun): Record<string, string | null> {
  const roles = Object.entries(run.manifest?.roles ?? {});
  return Object.fromEntries(roles.map(([role, value]) => [role, value.modelVersion]));
}

// RNF-006, RNF-012
export function repetitionResult(
  input: ScoringInput,
  run: EvaluationRun,
  repetition: number,
): RepetitionResult {
  const { golden, lines, estimate } = input;
  const findings = golden.cases.flatMap((entry) => entry.findings);
  const absences = golden.cases.flatMap((entry) => entry.absences);
  const overall = scoreClaims(run.claims, findings, absences);
  return {
    repetition,
    runId: run.runId,
    endState: run.endState,
    errorCode: run.errorCode,
    modelVersions: versionsOf(run),
    costMicros: run.costMicros,
    supportedClaims: overall.supported,
    costPerSupportedClaimMicros: perClaim(run.costMicros, overall.supported),
    overall,
    citationValidity: citationValidity(run.claims, lines),
    estimate: estimateAccuracy({ ...estimate, actualMicros: run.costMicros }),
    cases: golden.cases.map((entry) => scoreCase(run.claims, entry)),
  };
}

function errorOf(repetition: RepetitionResult): number | null {
  return repetition.estimate.status === 'measured' ? repetition.estimate.error : null;
}

function summaryOf(repetitions: readonly RepetitionResult[]): Results['summary'] {
  const of = (pick: (r: RepetitionResult) => number | null): Spread | null =>
    spreadOf(repetitions.map(pick));
  return {
    precision: of((r) => r.overall.precision),
    strictPrecision: of((r) => r.overall.strictPrecision),
    recall: of((r) => r.overall.recall),
    recallAll: of((r) => r.overall.recallAll),
    citationValidity: of((r) => r.citationValidity.rate),
    costMicros: of((r) => r.costMicros),
    costPerSupportedClaimMicros: of((r) => r.costPerSupportedClaimMicros),
    estimateError: of(errorOf),
  };
}

function casesOf(golden: GoldenSet, repetitions: readonly RepetitionResult[]): Results['cases'] {
  return golden.cases.map((entry) => {
    const scores = repetitions.flatMap((r) => r.cases.filter((c) => c.caseId === entry.id));
    return {
      caseId: entry.id,
      precision: spreadOf(scores.map((s) => s.precision)),
      recall: spreadOf(scores.map((s) => s.recall)),
      recallAll: spreadOf(scores.map((s) => s.recallAll)),
    };
  });
}

function target(value: number, spread: Spread | null): Results['targets']['precision'] {
  const mean = spread?.mean ?? null;
  return { target: value, mean, met: mean === null ? null : mean >= value };
}

function targetsOf(
  summary: Results['summary'],
  repetitions: readonly RepetitionResult[],
): Results['targets'] {
  const measured = repetitions.filter((r) => r.estimate.status === 'measured');
  const within = measured.filter(
    (r) => r.estimate.status === 'measured' && r.estimate.withinTarget,
  );
  return {
    precision: target(TARGETS.precision, summary.precision),
    recall: target(TARGETS.recall, summary.recall),
    citationValidity: target(TARGETS.citationValidity, summary.citationValidity),
    estimate: { target: ESTIMATE_TOLERANCE, measured: measured.length, within: within.length },
  };
}

// RNF-006, RNF-015
export function resultsOf(
  experimentId: string,
  golden: GoldenSet,
  repetitions: readonly RepetitionResult[],
): Results {
  const summary = summaryOf(repetitions);
  return {
    schemaVersion: 1,
    experimentId,
    goldenSetVersion: golden.version,
    repetitions: [...repetitions],
    summary,
    cases: casesOf(golden, repetitions),
    targets: targetsOf(summary, repetitions),
  };
}
