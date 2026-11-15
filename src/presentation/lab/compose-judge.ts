import type { PromptFile } from '../../application/agent/prompt-file.js';
import { AnswerJudge } from '../../application/lab/judge/answer-judge.js';
import type { Rubric } from '../../application/lab/judge/rubric.js';
import type { SpendLedger } from '../../application/lab/spend-ledger.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { LabCallGate } from '../../infrastructure/lab/lab-call-gate.js';
import type { Guarded, LabParts } from './compose-lab.js';

// Architecture section 2 (composition root), RF-1407, RF-1402, ADR-029: the judge of a lab
// invocation. Its model is built by the same guarded provider factory as the target's (egress and
// budget guards innermost), under the planner role, and sits behind a ledger gate of its own over
// the invocation's ledger, so a judge call is held, settled and capped like every other lab call.
// The judge's output limit is set here: it needs a short JSON reply, not the planner's limit.

export interface JudgeSetup {
  readonly model: { readonly provider: string; readonly model: string };
  readonly prompt: PromptFile;
  /** The rubric of each family the judge may be asked about. */
  readonly rubrics: ReadonlyMap<string, Rubric>;
}

export interface JudgeProblem {
  readonly code: ErrorCode;
  readonly message: string;
}

const JUDGE_MAX_OUTPUT_TOKENS = 3000;

function judgeSettings(parts: LabParts, setup: JudgeSetup): ProjectSettings {
  const { settings, limits } = parts;
  const chosen = {
    ...settings.roles.planner,
    ...setup.model,
    maxOutputTokens: JUDGE_MAX_OUTPUT_TOKENS,
  };
  const run = { ...settings.budget.run, maxCostMicros: limits.invocationCapMicros };
  return {
    ...settings,
    roles: { ...settings.roles, planner: chosen },
    budget: { ...settings.budget, run },
  };
}

/** Builds the judge before any call is sent, so a judge that cannot be used stops the command first. */
// RF-1407
export async function composeJudge(
  parts: LabParts,
  guarded: Guarded,
  ledger: SpendLedger,
  setup: JudgeSetup,
): Promise<Result<AnswerJudge, JudgeProblem>> {
  const { provider, model } = setup.model;
  if (!parts.priceTable.prices.some((each) => each.provider === provider && each.model === model)) {
    const code = ERROR_CODES.modelUnpriced;
    return err({
      code,
      message: `The judge ${provider}:${model} has no price, so its cost cannot be counted (${code}).`,
    });
  }
  const { account, run, sinks } = guarded;
  const built = await guarded.factory.build({
    ...{ account, run, settings: judgeSettings(parts, setup), roles: ['planner'], sinks },
    cloudConsent: true,
    approvedAmount: undefined,
  });
  const chosen = built.ok ? built.value.get('planner') : undefined;
  if (!built.ok || chosen?.worstCaseOf === undefined) {
    const code = (built.ok ? undefined : built.error[0]?.code) ?? ERROR_CODES.providerUnavailable;
    return err({ code, message: `The judge ${provider}:${model} cannot be used (${code}).` });
  }
  const { worstCaseOf } = chosen;
  const gate = new LabCallGate({
    ...{ inner: chosen.provider, ledger, tap: guarded.tap, clock: parts.clock },
    worstCaseMicros: (each) => Number(worstCaseOf(each).micros),
  });
  const temperature = chosen.temperature === undefined ? {} : { temperature: chosen.temperature };
  return ok(
    new AnswerJudge({
      role: {
        provider: gate,
        model: chosen.model,
        maxOutputTokens: chosen.maxOutputTokens,
        ...temperature,
      },
      meter: gate,
      ...{ model: setup.model, prompt: setup.prompt, rubrics: setup.rubrics, ids: parts.ids },
    }),
  );
}
