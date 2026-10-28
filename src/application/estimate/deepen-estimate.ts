import type { Actor } from '../../domain/accounts/actor.js';
import type { PriceTable } from '../../domain/budget/price-table.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import { canDeepen } from '../../domain/deepen/deepen-record.js';
import { planRound, type RoundPlan } from '../../domain/deepen/round-plan.js';
import { DEEPEN_ROUNDS, isAllowedRoundLimit } from '../../domain/deepen/stop-rule.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import { MERGE_ANSWER_TOKENS, MERGE_PROMPT_TOKENS } from '../consolidate/merge-request.js';
import { answersGivenTo } from '../deepen/deepen-answers.js';
import { roundTasks } from '../deepen/deepen-tasks.js';
import { latestScan } from '../deepen/latest-scan.js';
import type { ModelList } from '../models/model-list.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { PriorCards } from '../ports/prior-cards.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { ProviderKeyRepository } from '../ports/provider-key-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { TaskResults } from '../ports/task-results.js';
import type { ReaderTask } from '../understand/reader-tasks.js';
import { scopeOf } from '../runs/run-scope.js';
import { planRerun } from '../understand/answer-rerun.js';
import { assumptionsOf } from './estimate-assumptions.js';
import { shareTokens, sumPoints, withJudgements } from './estimate-run.js';
import type {
  ByScenario,
  EstimatePoint,
  ReaderAssumptions,
  RoleEstimate,
  Scenario,
} from './estimate-types.js';
import { readerTokens, type TokenFigures } from './reader-estimate.js';
import { estimateRole } from './role-estimate.js';

// RF-209, RF-425, ADR-007, DEC-145: the estimate the owner sees before a Deepen starts. The first
// round is planned from the completed run as it is (claims to judge, rejected first-party claims to
// re-read, first-party files never read), and its reader, verifier and summariser tokens are priced
// like any estimate. All rounds are given as that round's figure times the round limit: a working
// ceiling, not a proven maximum. A later round usually has less to do (fewer rejected claims, fewer
// unread files), but its replacements and new claims may need more verifier calls than the first
// round's, so the figure can be passed. Both are compared with the run cap, which stops the run.

export interface DeepenEstimateDependencies {
  readonly projects: Pick<ProjectRepository, 'find'>;
  readonly runs: Pick<RunIndex, 'find' | 'list'>;
  readonly scans: ScanResults;
  readonly taskResults: Pick<TaskResults, 'read'>;
  readonly keys: Pick<ProviderKeyRepository, 'find'>;
  readonly priceTable: PriceTable;
  /** The shipped model list: the context window and output limit of each model (Q-57). */
  readonly models: ModelList;
  /** DEC-179: the answers of the project the Deepen gives to its readers. */
  readonly answers: Pick<AnswersFile, 'answeredQuestions'>;
  readonly priorCards: PriorCards;
}

export interface DeepenEstimateRequest {
  readonly actor: Actor;
  readonly runId: string;
  readonly maxRounds?: number | undefined;
  readonly coveragePass?: boolean | undefined;
}

export interface DeepenEstimate {
  readonly priceTableVersion: string;
  readonly currency: 'USD';
  readonly maxRounds: number;
  readonly coveragePass: boolean;
  /** What the first round would do. */
  readonly plan: {
    readonly judge: number;
    readonly reread: number;
    readonly outOfScope: number;
    /** EV-10: areas that failed and that the round reads again. */
    readonly failedAreas: number;
    /** DEC-179: the answered questions of the project the first round gives to its readers. */
    readonly answers: number;
    readonly unreadFiles: number;
    readonly unreadTokens: number;
  };
  readonly roles: readonly RoleEstimate[];
  readonly round: ByScenario<EstimatePoint>;
  /**
   * The first round times the round limit: a working ceiling, not a proven maximum. A page that
   * shows it must say so, and that the run cap is what stops the run (part 2 of P2-41).
   */
  readonly allRounds: ByScenario<EstimatePoint>;
  readonly cap: { readonly maxCostMicros: number; readonly maxTokens: number };
  /** Whether the high figure passes the run cap. */
  readonly overCap: { readonly round: boolean; readonly allRounds: boolean };
}

export type DeepenEstimateProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.runNotDeepenable
  | typeof ERROR_CODES.requestInvalid
  | typeof ERROR_CODES.codeMapMissing;

function byScenario<T>(figure: (scenario: Scenario) => T): ByScenario<T> {
  return { low: figure('low'), likely: figure('likely'), high: figure('high') };
}

/**
 * RF-250, Q-52: the summariser at the end of a Deepen. The cards the rounds wrote are compared (one
 * call for each type asked, each resending the merge prompt), then the overview reads them again.
 */
function summariserOf(
  reader: ByScenario<TokenFigures>,
  assumptions: ReaderAssumptions,
): ByScenario<TokenFigures> {
  return byScenario((scenario) => {
    const share = shareTokens(reader, assumptions.summariserSharePercent)[scenario];
    const merges = assumptions.summariserMergeCalls[scenario];
    return {
      ...share,
      inputTokens: share.inputTokens * 2 + merges * MERGE_PROMPT_TOKENS,
      outputTokens: merges * MERGE_ANSWER_TOKENS + assumptions.overviewOutputTokens[scenario],
    };
  });
}

function times(points: ByScenario<EstimatePoint>, rounds: number): ByScenario<EstimatePoint> {
  return byScenario((scenario) => ({
    inputTokens: points[scenario].inputTokens * rounds,
    outputTokens: points[scenario].outputTokens * rounds,
    costMicros: points[scenario].costMicros * BigInt(rounds),
  }));
}

function overCap(point: EstimatePoint, cap: DeepenEstimate['cap']): boolean {
  const tokens = point.inputTokens + point.outputTokens;
  return tokens > cap.maxTokens || point.costMicros > BigInt(cap.maxCostMicros);
}

function planSummary(plan: RoundPlan, answers: number): DeepenEstimate['plan'] {
  return {
    judge: plan.judge.length,
    reread: plan.reread.length,
    outOfScope: plan.outOfScope.length,
    failedAreas: plan.failedAreas.length,
    answers,
    unreadFiles: plan.gaps.length,
    unreadTokens: plan.gaps.reduce((sum, gap) => sum + gap.tokens, 0),
  };
}

export class EstimateDeepen {
  private readonly deps: DeepenEstimateDependencies;

  constructor(deps: DeepenEstimateDependencies) {
    this.deps = deps;
  }

  // RF-209, RF-425, RF-1105
  async execute(
    request: DeepenEstimateRequest,
  ): Promise<Result<DeepenEstimate, DeepenEstimateProblem>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err(ERROR_CODES.notFound);
    if (!canDeepen(run)) return err(ERROR_CODES.runNotDeepenable);
    const maxRounds = request.maxRounds ?? DEEPEN_ROUNDS.default;
    if (!isAllowedRoundLimit(maxRounds)) return err(ERROR_CODES.requestInvalid);
    const project = await this.deps.projects.find(run.userId, run.projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    const scanned = await latestScan(this.deps, run);
    if (scanned === undefined) return err(ERROR_CODES.codeMapMissing);
    const { codeMap } = scanned;
    const coveragePass = request.coveragePass !== false;
    const plan = await this.planOf(run, codeMap, coveragePass);
    const assumptions = assumptionsOf(project.settings, this.deps.models);
    const tasks = roundTasks(plan, codeMap, 1);
    const answers = await this.answersOf(run, codeMap, tasks);
    const reader = readerTokens(
      tasks.map((task) => task.area),
      assumptions,
    );
    const verifier = withJudgements(
      shareTokens(reader, assumptions.verifierSharePercent),
      plan.judge.length,
    );
    const overview = summariserOf(reader, assumptions);
    const roles = await Promise.all([
      estimateRole(this.deps, project, { role: 'reader', tokens: reader }),
      estimateRole(this.deps, project, { role: 'verifier', tokens: verifier }),
      estimateRole(this.deps, project, { role: 'summariser', tokens: overview }),
    ]);
    const round = sumPoints(roles.map((role) => role.points));
    // A working ceiling, not a proven maximum (see the comment at the top of the file).
    const allRounds = times(round, maxRounds);
    const { run: cap } = project.settings.budget;
    return ok({
      ...{
        priceTableVersion: this.deps.priceTable.version,
        currency: this.deps.priceTable.currency,
      },
      ...{ maxRounds, coveragePass, plan: planSummary(plan, answers), roles, round, allRounds },
      cap: { maxCostMicros: cap.maxCostMicros, maxTokens: cap.maxTokens },
      overCap: { round: overCap(round.high, cap), allRounds: overCap(allRounds.high, cap) },
    });
  }

  /** DEC-179: how many answered questions of the project the tasks of the first round are given. */
  private async answersOf(
    run: Run,
    codeMap: CodeMap,
    tasks: readonly ReaderTask[],
  ): Promise<number> {
    const deps = { answers: this.deps.answers, cards: this.deps.priorCards };
    const project = { userId: run.userId, projectId: run.projectId };
    const names = codeMap.areas.map((area) => area.name);
    const plan = await planRerun(deps, project, names, { includeAnswered: true });
    return answersGivenTo(tasks, { deps, plan }).length;
  }

  /** RF-209: the first round of a Deepen of the run, as its results stand. */
  private async planOf(run: Run, codeMap: CodeMap, coveragePass: boolean): Promise<RoundPlan> {
    const results = await this.deps.taskResults.read(scopeOf(run));
    return planRound({
      cards: results.flatMap((result) => result.cards),
      coverage: results.map((result) => result.coverage),
      files: codeMap.files,
      ...{ reread: new Set<string>(), writtenHere: new Set<string>(), coveragePass },
      retriedAreas: new Set<string>(),
    });
  }
}
