import { z } from 'zod';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { judgeInfoSchema, judgementSchema } from './judge/judge-results.js';
import { judgeSummaryOf, type JudgeSummary } from './judge/judge-summary.js';
import { ALL_CASES, describeSelection, sameSelection } from './lab-selection.js';
import { summariseTurns, toolTurnSchema, type TurnSummary } from './lab-turns.js';

// RF-1403, RNF-015: what one lab invocation writes (`lab-out/<id>/results.json`), its summary and
// the side-by-side comparison of two. The figures of the target's calls are deterministic; the judge's
// scores (RF-1407), present only in a run made with `--judge`, are kept apart in each case's `judge`.

const count = z.number().int().min(0);

const caseSchema = z.strictObject({
  caseId: z.string().min(1),
  repetition: z.number().int().min(1),
  split: z.enum(['tune', 'held-back']),
  expected: z.string().nullable(),
  /** The target's short label of the result (for the verifier: Supported, Rejected, Unverified). */
  detail: z.string(),
  /** The last answer of the model, masked and cut. */
  answer: z.string(),
  usable: z.boolean(),
  /** Null when the target has no parser of a first answer (a reader's first turn): not applicable. */
  validFirstTry: z.boolean().nullable(),
  repaired: z.boolean(),
  refused: z.boolean(),
  rstCode: z.string().nullable(),
  agreed: z.boolean().nullable(),
  calls: count,
  inputTokens: count,
  outputTokens: count,
  latencyMs: count,
  costMicros: count,
  /** RF-1410: what a reader turn that a run answers with tool calls did. */
  turn: toolTurnSchema.optional(),
  /** RF-1407: the judge's scores, present only in a run made with `--judge`. */
  judge: judgementSchema.optional(),
});

const resultsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  at: z.string(),
  rosettaVersion: z.string(),
  prompt: z.strictObject({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }),
  model: z.strictObject({
    provider: z.string(),
    model: z.string(),
    modelVersion: z.string().nullable(),
  }),
  caseSet: z.strictObject({ version: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/u) }),
  repetitions: count,
  planned: count,
  endState: z.enum(['Completed', 'Refused']),
  refusal: z.string().nullable(),
  cases: z.array(caseSchema),
  /** RF-1409: which cases of the set were sent; a run without it sent every case. */
  selection: z
    .strictObject({
      split: z.enum(['tune', 'held-back', 'all']),
      sample: z.number().int().min(1).nullable(),
    })
    .optional(),
  judge: judgeInfoSchema.optional(),
});

export type LabCaseResult = z.infer<typeof caseSchema>;
export type LabResults = z.infer<typeof resultsSchema>;

// RF-1403
export function parseLabResults(data: unknown): Result<LabResults, string> {
  const parsed = resultsSchema.safeParse(data);
  if (parsed.success) return ok(parsed.data);
  const problems = parsed.error.issues.map(
    (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
  );
  return err(problems.join('; '));
}

export interface LabSummary {
  readonly cases: number;
  readonly calls: number;
  /**
   * The share of cases whose first answer was valid, among the cases it applies to; null for a run
   * of no such case (no case, or a target with no parser of a first answer).
   */
  readonly firstTryRate: number | null;
  readonly repairedRate: number | null;
  readonly invalidRate: number | null;
  readonly refusedCount: number;
  /** Cases that failed with an RST code, by code. */
  readonly errorsByCode: Readonly<Record<string, number>>;
  /** The share of cases with an expected label whose answer agreed; null when none has one. */
  readonly agreementRate: number | null;
  /** Per call. */
  readonly meanInputTokens: number | null;
  readonly meanOutputTokens: number | null;
  readonly meanLatencyMs: number | null;
  readonly costMicros: number;
  /** RF-1407: the judge's means; null for a run without a judge. */
  readonly judge: JudgeSummary | null;
  /** RF-1410: the counts per tool turn; null for a run with no case that records a turn. */
  readonly turns: TurnSummary | null;
}

function rate(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

function sum(cases: readonly LabCaseResult[], pick: (each: LabCaseResult) => number): number {
  return cases.reduce((total, each) => total + pick(each), 0);
}

function errorsOf(cases: readonly LabCaseResult[]): Record<string, number> {
  const errors: Record<string, number> = {};
  for (const each of cases) {
    if (each.rstCode !== null) errors[each.rstCode] = (errors[each.rstCode] ?? 0) + 1;
  }
  return errors;
}

// RF-1403
export function summariseLab(results: LabResults): LabSummary {
  const { cases } = results;
  const calls = sum(cases, (each) => each.calls);
  const labelled = cases.filter((each) => each.agreed !== null);
  const invalid = cases.filter((each) => !each.usable && !each.refused && each.rstCode === null);
  const checked = cases.filter((each) => each.validFirstTry !== null);
  return {
    cases: cases.length,
    calls,
    firstTryRate: rate(
      checked.filter((each) => each.validFirstTry === true).length,
      checked.length,
    ),
    repairedRate: rate(cases.filter((each) => each.repaired).length, cases.length),
    invalidRate: rate(invalid.length, cases.length),
    refusedCount: cases.filter((each) => each.refused).length,
    errorsByCode: errorsOf(cases),
    agreementRate: rate(labelled.filter((each) => each.agreed === true).length, labelled.length),
    meanInputTokens: rate(
      sum(cases, (each) => each.inputTokens),
      calls,
    ),
    meanOutputTokens: rate(
      sum(cases, (each) => each.outputTokens),
      calls,
    ),
    meanLatencyMs: rate(
      sum(cases, (each) => each.latencyMs),
      calls,
    ),
    costMicros: sum(cases, (each) => each.costMicros),
    judge: judgeSummaryOf(cases),
    turns: summariseTurns(cases.map((each) => each.turn)),
  };
}

export interface ComparedSide {
  readonly name: string;
  readonly version: string;
  readonly sha256: string;
  readonly model: string;
  readonly summary: LabSummary;
}

export interface LabComparison {
  readonly a: ComparedSide;
  readonly b: ComparedSide;
  readonly cases: readonly {
    readonly caseId: string;
    readonly repetition: number;
    readonly a: LabCaseResult | undefined;
    readonly b: LabCaseResult | undefined;
  }[];
}

function sideOf(results: LabResults): ComparedSide {
  const { prompt, model } = results;
  return {
    ...{ name: prompt.name, version: prompt.version, sha256: prompt.sha256 },
    model: `${model.provider}:${model.model}`,
    summary: summariseLab(results),
  };
}

const keyOf = (each: LabCaseResult): string => `${each.caseId}#${String(each.repetition)}`;

/** The cases of both runs, in the order of the first run and then those only the second has. */
function pairedCases(a: LabResults, b: LabResults): LabComparison['cases'] {
  const second = new Map(b.cases.map((each) => [keyOf(each), each]));
  const first = new Map(a.cases.map((each) => [keyOf(each), each]));
  const keys = [...new Set([...first.keys(), ...second.keys()])];
  return keys.map((key) => {
    const one = first.get(key) ?? second.get(key);
    return {
      caseId: one?.caseId ?? key,
      repetition: one?.repetition ?? 1,
      a: first.get(key),
      b: second.get(key),
    };
  });
}

// RF-1403
export function compareLab(a: LabResults, b: LabResults): Result<LabComparison, string> {
  if (a.caseSet.sha256 !== b.caseSet.sha256) {
    return err(
      `The runs used different case sets (${a.caseSet.version} and ${b.caseSet.version}): compare runs of the same case set.`,
    );
  }
  if (!sameSelection(a.selection, b.selection)) {
    const [first, second] = [a.selection ?? ALL_CASES, b.selection ?? ALL_CASES];
    return err(
      `The runs used different case selections (${describeSelection(first)} and ${describeSelection(second)}): compare runs over the same selection.`,
    );
  }
  return ok({ a: sideOf(a), b: sideOf(b), cases: pairedCases(a, b) });
}
