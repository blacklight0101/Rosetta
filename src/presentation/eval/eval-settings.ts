import type { EvaluationConfig } from '../../application/eval/evaluation-config.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import type { GoldenSet } from '../../domain/eval/golden-set.js';
import type { EvalArgs } from './eval-args.js';

// RNF-006, RNF-015, ADR-007, RF-143: the settings of the evaluation's runs, the caps its budget
// guard enforces while they run, and what the command shows before anything is sent. The run cap of
// the settings file bounds each run; the total cap bounds all of them, as the evaluation account's
// daily cap and the server's day and month caps. The command line chooses models, never a cap.

const EVAL_ROLES = ['reader', 'verifier', 'summariser'] as const;

// RNF-015, ADR-007
export function evaluationSettings(
  template: ProjectSettings,
  config: EvaluationConfig,
  args: EvalArgs,
): ProjectSettings {
  const roles = { ...config.roles, ...args.roles };
  const chosen = { ...template.roles };
  for (const role of EVAL_ROLES) {
    const choice = roles[role];
    if (choice !== undefined) chosen[role] = { ...chosen[role], ...choice };
  }
  const run = { ...template.budget.run, maxCostMicros: config.runCapMicros };
  return {
    ...template,
    roles: chosen,
    budget: { ...template.budget, run },
    agents: { parallelism: config.parallelism ?? template.agents.parallelism },
  };
}

export interface EvaluationCaps {
  /** The evaluation account's daily cap. */
  readonly dailyCapMicros: bigint;
  readonly runMicros: bigint;
  readonly userDayMicros: bigint;
  readonly serverMonthMicros: bigint;
}

/**
 * ADR-007: the caps of the evaluation's budget guard. The daily cap stands in for the total cap:
 * a day that turned over during the runs (UTC midnight) would reset it, which the pre-check of the
 * high estimate against the total cap still bounds.
 */
export function evaluationCaps(caps: {
  readonly totalCapMicros: number;
  readonly runCapMicros: number;
}): EvaluationCaps {
  const total = BigInt(caps.totalCapMicros);
  return {
    dailyCapMicros: total,
    runMicros: BigInt(caps.runCapMicros),
    userDayMicros: total,
    serverMonthMicros: total,
  };
}

export interface EvaluationPlanParts {
  readonly settings: ProjectSettings;
  readonly totalCapMicros: number;
  readonly repetitions: number;
}

export function dollars(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

// RF-143, RNF-006
export function evaluationPlan(parts: EvaluationPlanParts, golden: GoldenSet): string[] {
  const { settings, totalCapMicros, repetitions } = parts;
  const { source } = golden;
  const where = source.subpath === '' ? '' : ` (${source.subpath})`;
  const roles = EVAL_ROLES.map((role) => {
    const choice = settings.roles[role];
    return `  ${role}: ${choice.provider} ${choice.model}`;
  });
  return [
    `npm run eval runs ${String(repetitions)} runs of the golden set ${golden.version}.`,
    `It sends the source of ${source.url} at ${source.commit}${where} to these models:`,
    ...roles,
    `Each run may cost up to ${dollars(settings.budget.run.maxCostMicros)}; all runs together up to ${dollars(totalCapMicros)}.`,
  ];
}
