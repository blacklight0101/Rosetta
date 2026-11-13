import type { PromptFile } from '../agent/prompt-file.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { LabCaseSet } from './lab-case-set.js';
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
}

export interface RunLabRequest {
  readonly target: LabTarget;
  readonly prompt: PromptFile;
  readonly model: { readonly provider: string; readonly model: string };
  readonly caseSet: LabCaseSet;
  readonly setSha256: string;
  readonly repetitions: number;
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

/** RF-1403: the deterministic metrics of one finished case. */
function resultOf(
  one: Prepared & { readonly repetition: number },
  outcome: TargetOutcome,
  metered: MeteredCase,
  target: LabTarget,
): LabCaseResult {
  const { repetition } = one;
  const first = metered.calls[0];
  const validFirstTry = first !== undefined && target.readsAnswer(first.text);
  const last = metered.calls.at(-1);
  return {
    ...{ caseId: one.caseId, repetition, split: one.split, expected: one.expected ?? null },
    ...{ detail: outcome.detail, answer: (last?.text ?? '').slice(0, ANSWER_CHARS) },
    ...{ usable: outcome.usable, validFirstTry },
    repaired: outcome.usable && !validFirstTry && metered.calls.length > 1,
    refused: metered.failures.some((code) => REFUSED_BEFORE_SENDING.has(code)),
    rstCode: metered.failures[0] ?? null,
    agreed: one.expected === undefined ? null : outcome.detail === one.expected,
    calls: metered.calls.length,
    inputTokens: total(metered, (call) => call.inputTokens),
    outputTokens: total(metered, (call) => call.outputTokens),
    latencyMs: total(metered, (call) => call.latencyMs),
    costMicros: total(metered, (call) => call.costMicros) + metered.unansweredCostMicros,
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
        const result = resultOf({ ...one, repetition }, outcome, metered, request.target);
        cases.push(result);
        if (result.refused)
          refusal =
            this.deps.meter.stopped() ??
            `A guard refused the call (${result.rstCode ?? 'no code'}).`;
      }
    }
    const results = this.resultsOf(request, { at, planned, cases, modelVersion, refusal });
    return this.write(results);
  }

  /** Why the invocation stops after a case: the ledger stopped it, or a guard refused a call. */
  private stopOf(result: LabCaseResult): string | null {
    const stopped = this.deps.meter.stopped();
    if (stopped !== undefined) return stopped;
    if (!result.refused) return null;
    return `A guard refused the call (${result.rstCode ?? 'no code'}).`;
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
      caseSet: { version: caseSet.version, sha256: request.setSha256 },
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
