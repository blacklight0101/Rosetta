import type { Experiment } from '../../application/eval/evaluation-schema.js';
import {
  RunEvaluation,
  type EvaluationProblem,
  type EvaluationSummary,
} from '../../application/eval/run-evaluation.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import type { Actor } from '../../domain/accounts/actor.js';
import type { UserAccount } from '../../domain/accounts/user.js';
import type { Result } from '../../domain/errors/result.js';
import type { GoldenSet } from '../../domain/eval/golden-set.js';
import { FileEvaluationOutput } from '../../infrastructure/eval/evaluation-files.js';
import type { LoadedGoldenSet } from '../../infrastructure/eval/golden-set-file.js';
import { loadVerifierPrompts } from '../../infrastructure/prompts/verifier-prompt-files.js';
import { composePipeline, type Pipeline, type PipelineParts } from './eval-pipeline.js';
import { PipelineTarget } from './pipeline-target.js';

// Architecture section 2 (composition root), RNF-006, RNF-012, RNF-015, ADR-007, ADR-008: one
// evaluation. An account and a project of the evaluation's own (in memory) point at the golden
// set's pinned commit with the chosen settings; the account's daily cap and the server caps are the
// total cap, so the budget guard stops the runs that would pass it, and the run cap of the settings
// bounds each repetition. The results go to `eval-out/<id>/`.

export interface EvaluationParts extends PipelineParts {
  /** The `eval-out/` folder. */
  readonly outputDir: string;
  /** The project settings of the runs: the chosen models, the run cap, the scan settings. */
  readonly settings: ProjectSettings;
  /** The most every repetition together may cost, in micro-dollars. */
  readonly totalCapMicros: number;
}

function accountOf(parts: EvaluationParts): UserAccount {
  const now = parts.clock.now().getTime();
  return {
    ...{ id: parts.ids.uuid(), userName: 'evaluation', displayName: 'Evaluation' },
    ...{ role: 'user', state: 'Active', passwordHash: 'none', failedSignIns: 0 },
    ...{ firstFailedAt: null, lockedUntil: null, serverKeysAllowed: true },
    ...{ dailyCapMicros: BigInt(parts.totalCapMicros), ownDailyCapMicros: null },
    ...{ createdAt: now, updatedAt: now, lastSignInAt: null },
  };
}

interface Owner {
  readonly actor: Actor;
  readonly projectId: string;
}

async function projectOf(parts: EvaluationParts, s: Pipeline, golden: GoldenSet): Promise<Owner> {
  const account = accountOf(parts);
  await s.users.insert(account);
  const total = BigInt(parts.totalCapMicros);
  const runMicros = BigInt(parts.settings.budget.run.maxCostMicros);
  await s.serverSettings.saveCaps({ runMicros, userDayMicros: total, serverMonthMicros: total });
  const { source } = golden;
  const now = parts.clock.now().getTime();
  const stored = await s.projects.insertOrFind({
    ...{ id: parts.ids.uuid(), userId: account.id, name: `${source.owner}/${source.repo}` },
    ...{ sourceUrl: source.url, ref: source.commit, subpath: source.subpath },
    ...{ settings: parts.settings, settingsVersion: 1, createdAt: now, updatedAt: now },
  });
  return { actor: { userId: account.id, role: 'user' }, projectId: stored.project.id };
}

/** RNF-015: the settings `experiment.json` records besides the models and prompts. */
function recordedSettings(parts: EvaluationParts): Experiment['settings'] {
  const { settings } = parts;
  return {
    parallelism: settings.agents.parallelism,
    runCapMicros: settings.budget.run.maxCostMicros,
    runMaxTokens: settings.budget.run.maxTokens,
    areaTokenBudget: settings.scan.areaTokenBudget,
    maxFileBytes: settings.scan.maxFileBytes,
    priceTableVersion: parts.priceTable.version,
  };
}

// RNF-006, RNF-012, RNF-015
export async function runEvaluation(
  parts: EvaluationParts,
  golden: LoadedGoldenSet,
  repetitions: number,
): Promise<Result<EvaluationSummary, EvaluationProblem>> {
  // P2-11 red step: removed by the feat commit.
  if (repetitions >= 0) {
    return { ok: false, error: { code: 'RST-2006', message: `red step ${golden.sha256}` } };
  }
  const pipeline = composePipeline(parts);
  try {
    const owner = await projectOf(parts, pipeline, golden.set);
    const verifier = await loadVerifierPrompts(parts.promptsFolder);
    const evaluation = new RunEvaluation({
      target: new PipelineTarget({ ...pipeline, ...owner }),
      output: new FileEvaluationOutput({ outputDir: parts.outputDir, masker: parts.masker }),
      ...{ clock: parts.clock, ids: parts.ids, rosettaVersion: parts.rosettaVersion },
      extraPrompts: [verifier.system, verifier.retry],
    });
    return await evaluation.execute({
      ...{ goldenSet: golden.set, goldenSetSha256: golden.sha256, repetitions },
      ...{ totalCapMicros: parts.totalCapMicros, settings: recordedSettings(parts) },
    });
  } finally {
    await pipeline.queue.shutDown();
  }
}
