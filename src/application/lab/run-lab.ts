import type { PromptFile } from '../agent/prompt-file.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import { judgeStopReason, type CaseJudge } from './judge/answer-judge.js';
import type { JudgeInfo } from './judge/judge-results.js';
import { sourceText } from './judge/judge-source.js';
import type { LabCaseSet } from './lab-case-set.js';
import { ALL_CASES, type LabSelection } from './lab-selection.js';
import { REFUSED_BEFORE_SENDING, type LabCallMeter, type MeteredCase } from './lab-meter.js';
import type { LabCaseResult, LabResults } from './lab-results.js';
import type { LabTarget, PreparedCase, TargetEnv, TargetOutcome } from './lab-target.js';

// RF-1400, RF-1403, DEC-231, ADR-029: one lab invocation. The cases of a set are parsed by the
// prompt's target (a case the target cannot read stops everything before any call), then each case
// is rendered into the target's messages with the prompt file under test, sent through the
// provider the composition root built (guards and ledger gate included), and measured. A case that a
// cap refused ends the invocation: the cases left are not sent. Cases run one after another, in
// the order of the set, each as often as asked.

export interface LabOutput {
  /** Writes `results.json` of the invocation and returns its folder. */
  write(results: LabResults): Promise<string>;
}

export interface RunLabDependencies {
  readonly output: LabOutput;
  readonly meter: LabCallMeter;
  readonly role: TargetEnv['role'];
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly rosettaVersion: string;
  /** RF-1407: scores each answered case against the rubric of the prompt's family. */
  readonly judge?: CaseJudge;
}

export interface RunLabRequest {
  readonly target: LabTarget;
  readonly prompt: PromptFile;
  readonly model: { readonly provider: string; readonly model: string };
  readonly caseSet: LabCaseSet;
  readonly setSha256: string;
  readonly repetitions: number;
  /** RF-1409: which cases of the set caseSet holds, recorded in the results; every case when absent. */
  readonly selection?: LabSelection;
}

export interface LabProblem {
  readonly code: ErrorCode;
  readonly message: string;
  /** The results of an invocation that was paid for but could not be written. */
  readonly results?: LabResults;
}

export interface LabRun {
  readonly folder: string;
  readonly results: LabResults;
}

const ANSWER_CHARS = 2000;

interface Prepared {
  readonly caseId: string;
  readonly expected: string | undefined;
  readonly split: 'tune' | 'held-back';
  readonly input: unknown;
  readonly prepared: PreparedCase;
}

function prepare(request: RunLabRequest): Result<Prepared[], string> {
  const prepared: Prepared[] = [];
  const problems: string[] = [];
  for (const each of request.caseSet.cases) {
    const parsed = request.target.parseInput(each.input);
    if (parsed.ok) {
      prepared.push({
        caseId: each.id,
        expected: each.expected,
        split: each.split,
        input: each.input,
        prepared: parsed.value,
      });
    } else problems.push(`case ${each.id}: ${parsed.error}`);
  }
  return problems.length === 0 ? ok(prepared) : err(problems.join('; '));
}

const total = (
  metered: MeteredCase,
  pick: (call: MeteredCase['calls'][number]) => number,
): number => metered.calls.reduce((sum, call) => sum + pick(call), 0);

/** RF-1403: whether the first answer was valid; null when the target has no parser of it. */
function firstTryOf(
  first: MeteredCase['calls'][number] | undefined,
  target: LabTarget,
): boolean | null {
  const read = target.readsAnswer(first?.text ?? '');
  return read === null ? null : first !== undefined && read;
}

/** RF-1410: a label usable only where the case expects it counts only there. */
function usableOf(outcome: TargetOutcome, expected: string | undefined): boolean {
  return outcome.usable || (outcome.usableWhenExpected === true && expected === outcome.detail);
}

/** RF-1403: the deterministic metrics of one finished case. */
function resultOf(
  one: Prepared & { readonly repetition: number },
  outcome: TargetOutcome,
  metered: MeteredCase,
  target: LabTarget,
): LabCaseResult {
  const { repetition } = one;
  const first = metered.calls[0];
  const validFirstTry = firstTryOf(first, target);
  const last = metered.calls.at(-1);
  return {
    ...{ caseId: one.caseId, repetition, split: one.split, expected: one.expected ?? null },
    ...{ detail: outcome.detail, answer: (last?.text ?? '').slice(0, ANSWER_CHARS) },
    ...{ usable: usableOf(outcome, one.expected), validFirstTry },
    repaired: outcome.usable && validFirstTry === false && metered.calls.length > 1,
    refused: metered.failures.some((code) => REFUSED_BEFORE_SENDING.has(code)),
    rstCode: metered.failures[0] ?? null,
    agreed: one.expected === undefined ? null : outcome.detail === one.expected,
    calls: metered.calls.length,
    inputTokens: total(metered, (call) => call.inputTokens),
    outputTokens: total(metered, (call) => call.outputTokens),
    latencyMs: total(metered, (call) => call.latencyMs),
    costMicros: total(metered, (call) => call.costMicros) + metered.unansweredCostMicros,
    ...recordsOf(outcome),
  };
}

/** RF-1403, RF-1410: what the target recorded beside the label, each kept only when present. */
function recordsOf(outcome: TargetOutcome): Partial<LabCaseResult> {
  const { followUps, counts, turn } = outcome;
  return {
    ...(followUps === undefined ? {} : { followUps: { ...followUps } }),
    ...(counts === undefined ? {} : { counts: { ...counts } }),
    ...(turn === undefined ? {} : { turn }),
  };
}

// RF-1400
export class RunLab {
  private readonly deps: RunLabDependencies;

  constructor(deps: RunLabDependencies) {
    this.deps = deps;
  }

  async execute(request: RunLabRequest): Promise<Result<LabRun, LabProblem>> {
    const prepared = prepare(request);
    if (!prepared.ok)
      return err({ code: ERROR_CODES.configurationInvalid, message: prepared.error });
    const at = this.deps.clock.now().toISOString();
    const planned = prepared.value.length * request.repetitions;
    const cases: LabCaseResult[] = [];
    let modelVersion: string | null = null;
    let refusal: string | null = null;
    const traceId = this.deps.ids.uuid().replaceAll('-', '').padEnd(32, '0').slice(0, 32);
    let calls = 0;
    for (const one of prepared.value) {
      for (
        let repetition = 1;
        repetition <= request.repetitions && refusal === null;
        repetition += 1
      ) {
        const env: TargetEnv = {
          ...{ role: this.deps.role, ids: this.deps.ids, traceId },
          signal: new AbortController().signal,
          caseKey: `${one.caseId}-${String(repetition)}`,
          nextCallId: () => `lab-${request.model.model}#${String((calls += 1))}`,
        };
        this.deps.meter.begin();
        const outcome = await one.prepared
          .run(env, request.prompt)
          .catch((): TargetOutcome => ({ usable: false, detail: 'Failed' }));
        const metered = this.deps.meter.end();
        modelVersion = metered.calls.at(-1)?.modelVersion ?? modelVersion;
        const scored = resultOf({ ...one, repetition }, outcome, metered, request.target);
        const result = await this.judged(scored, one, request.target, metered);
        cases.push(result);
        refusal = this.stopOf(result);
      }
    }
    const results = this.resultsOf(request, { at, planned, cases, modelVersion, refusal });
    return this.write(results);
  }

  /**
   * RF-1407: the case with the judge's scores, when a judge is set and the case was answered. RF-1410:
   * a reader turn that a run answers with tool calls has no answer to judge.
   */
  private async judged(
    result: LabCaseResult,
    one: Prepared,
    target: LabTarget,
    metered: MeteredCase,
  ): Promise<LabCaseResult> {
    const answer = metered.calls.at(-1)?.text;
    if (this.deps.judge === undefined || answer === undefined) return result;
    if (result.turn !== undefined) return result;
    const judge = await this.deps.judge.score({
      ...{ family: target.id.split('/')[0] ?? target.id, caseKey: result.caseId },
      ...{ source: sourceText(one.input), answer, label: one.expected ?? null },
    });
    return { ...result, judge };
  }

  /** Why the invocation stops after a case: a ledger stopped it, or a guard refused a call. */
  private stopOf(result: LabCaseResult): string | null {
    const stopped = this.deps.meter.stopped() ?? this.deps.judge?.stopped();
    if (stopped !== undefined) return stopped;
    const judgeStop = judgeStopReason(result.judge, 'invocation');
    if (judgeStop !== null) return judgeStop;
    if (!result.refused) return null;
    return `A guard refused the call (${result.rstCode ?? 'no code'}).`;
  }

  private judgeOf(request: RunLabRequest): { judge?: JudgeInfo } {
    const family = request.target.id.split('/')[0] ?? request.target.id;
    const info = this.deps.judge?.infoFor(family);
    return info === undefined ? {} : { judge: info };
  }

  private resultsOf(
    request: RunLabRequest,
    done: {
      at: string;
      planned: number;
      cases: LabCaseResult[];
      modelVersion: string | null;
      refusal: string | null;
    },
  ): LabResults {
    const { prompt, model, caseSet } = request;
    return {
      ...{ schemaVersion: 1, id: this.deps.ids.runId('lab'), at: done.at },
      rosettaVersion: this.deps.rosettaVersion,
      prompt: {
        id: request.target.id,
        name: prompt.name,
        version: prompt.version,
        sha256: prompt.sha256,
      },
      model: { ...model, modelVersion: done.modelVersion },
      ...this.judgeOf(request),
      caseSet: { version: caseSet.version, sha256: request.setSha256 },
      selection: request.selection ?? ALL_CASES,
      repetitions: request.repetitions,
      planned: done.planned,
      endState: done.refusal === null ? 'Completed' : 'Refused',
      refusal: done.refusal,
      cases: done.cases,
    };
  }

  /** The calls were paid for, so a folder that cannot be written is reported with the results. */
  private async write(results: LabResults): Promise<Result<LabRun, LabProblem>> {
    try {
      return ok({ folder: await this.deps.output.write(results), results });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const message = `The results could not be written: ${reason}`;
      return err({ code: ERROR_CODES.reportWriteFailed, message, results });
    }
  }
}
