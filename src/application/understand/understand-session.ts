import type { Card } from '../../domain/cards/card.js';
import type { Overview } from '../../domain/overview/overview.js';
import type { ErrorCode } from '../../domain/errors/codes.js';
import { thirdPartyAreaNames } from '../../domain/code-map/third-party.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { CardOutputs, CardSource } from '../ports/card-outputs.js';
import type { Clock } from '../ports/clock.js';
import type { TaskResult, TaskResults } from '../ports/task-results.js';
import { isCapStop } from '../../domain/budget/cap-stop.js';
import type { RunOutcome } from '../ports/run-executor.js';
import type { RoleProvider } from '../providers/provider-set.js';
import { scopeOf } from '../runs/run-scope.js';
import type { CheckedCards } from '../verifier/citation-check.js';
import { awaitsJudgement } from '../verifier/awaits-judgement.js';
import { leaveUnverified } from '../verifier/leave-unverified.js';
import { announceCards } from './announce-cards.js';
import { areaFailureOf } from './area-failure.js';
import { changesOf, markAnswered, type Rerun } from './answer-rerun.js';
import { cardNoteOf, coverageNoteOf } from './area-notes.js';
import { judgementPartsOf, runJudgementStep, type JudgementContext } from './claim-judgement.js';
import { openQuestionsOf } from './open-questions.js';
import { overviewStep } from './overview-step.js';
import { consolidateStep } from './session-consolidation.js';
import { recordTaskState, type ReaderTaskContext } from './reader-task.js';
import type { ReaderTask } from './reader-tasks.js';
import { readerParallelism } from './reader-settings.js';
import { cardsOf, RunCards } from './run-cards.js';
import { RunCoverage, TaskReads } from './run-coverage.js';
import { failedOutcome, sessionOutcome, type TaskOutcome } from './session-outcome.js';
import { TaskLog } from './task-log.js';
import { runPool } from './task-pool.js';
import { taskResultOf } from './task-result-of.js';
import { withoutBookkeeping } from '../cards/bookkeeping-claims.js';
import { withoutAnsweredQuestions } from './answered-questions.js';
import { withoutThirdPartyQuestions } from './third-party-questions.js';
import { runReaderTaskWithRetry } from './task-retry.js';

// RF-200, RF-202, RF-203, RF-230, RF-264, RF-300, RF-301, RF-1002, DEC-98, RNF-002: the reader tasks
// of one understand run and what they leave: each ended task adds cards that are checked and
// written, so a stopped run keeps them (RF-230). Then open questions go to `answers.md`, claims are
// judged, duplicates merged and the overview written (RF-264).

interface UnderstandSessionDependencies {
  readonly cards: CardOutputs;
  readonly answers: AnswersFile;
  readonly clock: Clock;
  /** RF-006: what each ended task left, for a resume. */
  readonly taskResults: TaskResults;
}

export interface UnderstandSessionParts extends ReaderTaskContext {
  readonly rerun?: Rerun;
  readonly deps: UnderstandSessionDependencies;
  /** RF-301: the `verifier` role and its prompts, for the judgement step. */
  readonly verifier: JudgementContext['verifier'];
  /** The tasks this session runs. */
  readonly tasks: readonly ReaderTask[];
  /** RF-006: every task of the run in area order, and the results of those a resume keeps. */
  readonly allTasks: readonly ReaderTask[];
  readonly kept: readonly TaskResult[];
  readonly source: CardSource;
  /** RF-250: the role that merges the duplicate cards of several areas, and its prompt. */
  readonly summariser: RoleProvider;
  readonly mergePrompt: PromptFile;
  /** RF-264: the summariser's prompt for the overview. */
  readonly overviewPrompt: PromptFile;
}

export class UnderstandSession {
  private readonly parts: UnderstandSessionParts;
  private readonly cards: RunCards;
  private readonly coverage: RunCoverage;
  private readonly ends = new Map<string, TaskOutcome>();
  private readonly log: TaskLog;
  private readonly thirdParty: ReadonlySet<string>;
  private latest: CheckedCards;
  private outputFailure: ErrorCode | undefined;
  private overview: Overview | undefined;

  constructor(parts: UnderstandSessionParts) {
    this.parts = parts;
    this.log = new TaskLog(parts.logger, parts.execution.run.runKey);
    const kept = parts.kept;
    this.cards = new RunCards(parts.tasks, {
      cards: kept.flatMap((result) => result.cards),
      areasWithoutCards: kept.filter((result) => result.withoutCards).map((result) => result.area),
    });
    this.coverage = new RunCoverage(parts.allTasks);
    for (const result of kept) this.coverage.restore(result.agentTaskId, result.coverage);
    this.latest = { cards: kept.flatMap((result) => result.cards), checks: [] };
    this.thirdParty = thirdPartyAreaNames(parts.scanned.codeMap);
  }

  /** Lists every task as `Planned` and publishes the plan (RF-200, RF-1002). */
  // RF-200
  async plan(): Promise<void> {
    const { tasks, execution, role } = this.parts;
    for (const task of tasks) {
      await recordTaskState(this.parts, task, { state: 'Planned', turns: 0, cards: 0 });
      await execution.events.emit(
        'agent.planned',
        { area: task.area.name, role: 'reader', model: role.model },
        task.agentTaskId,
      );
    }
  }

  /** Runs the tasks, at most `agents.parallelism` at once, until all end or the run stops. */
  // RF-200
  async run(): Promise<void> {
    const { tasks, settings, execution } = this.parts;
    const options = { parallelism: readerParallelism(settings), signal: execution.signal };
    await runPool(tasks, options, async (task) => {
      const reads = new TaskReads();
      const result = await runReaderTaskWithRetry(this.parts, task, reads).catch(
        async (error: unknown) => {
          await this.log.failure(task, error);
          return failedOutcome(error);
        },
      );
      const asked = await withoutThirdPartyQuestions(this.log, this.thirdParty, task, result);
      // RF-243, P5-02: a question the lines it cites already answer is not asked.
      const quiet = await withoutAnsweredQuestions(
        this.log,
        this.parts.scanned.reader,
        task,
        asked,
      );
      // P3-110, EV-26: claims that only restate card ids or cite a non-file never reach the check.
      const where = { agentTaskId: task.agentTaskId, codeMap: this.parts.scanned.codeMap };
      const outcome = await withoutBookkeeping(execution.events, where, quiet);
      const failure = areaFailureOf(outcome);
      const cards = outcome.drafts;
      const note = coverageNoteOf(outcome.areaRead, this.thirdParty.has(task.area.name));
      this.coverage.record(task, this.parts.scanned.codeMap, { reads, failure, cards, note });
      await this.ended(task, outcome).catch(async (error: unknown) => {
        // RNF-002: an output that cannot be written fails the run, never the other tasks.
        await this.log.failure(task, error);
        this.outputFailure ??= failedOutcome(error).code;
      });
    });
  }

  /**
   * Publishes the cards not announced yet, adds the open questions to `answers.md` and merges the
   * duplicates of several areas. The questions come first: OQ cards are never merged, and a merge
   * whose files cannot be written must not take them with it.
   */
  // RF-203, DEC-98, RF-250
  async finish(): Promise<void> {
    await this.announce(true);
    await this.leaveUnjudged();
    await this.addQuestions();
    await this.judge();
    await this.consolidate();
    await this.writeOverview();
    await this.markAnswered();
  }

  private async writeOverview(): Promise<void> {
    const { latest, coverage, thirdParty } = this;
    this.overview = await overviewStep(this.parts, latest.cards, { coverage, thirdParty });
    await this.writeSet(latest.cards);
  }

  /** RF-241: the questions of the areas whose task ended `Done` are now `Answered`. */
  private async markAnswered(): Promise<void> {
    const { rerun, tasks } = this.parts;
    // RNF-002: a run whose card output failed has not used the answers; they stay for the next run.
    if (rerun === undefined || this.outputFailure !== undefined) return;
    const done = tasks
      .filter((task) => this.ends.get(task.agentTaskId)?.state === 'Done')
      .map((task) => task.area.name);
    await markAnswered(rerun.deps, rerun.plan, new Set(done));
  }

  private async addQuestions(): Promise<void> {
    const { deps, execution } = this.parts;
    const { run } = execution;
    const questions = openQuestionsOf(this.latest.cards, run.runKey);
    if (questions.length === 0) return;
    await deps.answers.addQuestions({ userId: run.userId, projectId: run.projectId }, questions);
  }

  /** RF-250: the duplicates of several areas become one card; the set is written again if any did. */
  private async consolidate(): Promise<void> {
    const state = { cards: this.latest.cards, areasWithoutCards: this.cards.areasWithoutCards() };
    const merged = await consolidateStep(this.parts, state);
    if (merged !== undefined) this.latest = { ...this.latest, cards: merged };
  }

  /** RF-301, RF-302: the claims the citation check passed are judged, before any merge (RF-250). */
  private async judge(): Promise<void> {
    if (!this.latest.cards.some((card) => card.claims.some(awaitsJudgement))) return;
    const parts = judgementPartsOf(this.parts, this.parts.deps.clock);
    const cards = await runJudgementStep(this.latest.cards, parts);
    this.latest = { ...this.latest, cards };
    await this.writeSet(cards);
    await this.writeCoverage();
    // RF-006: a resume reads the verdicts back with the results of the tasks.
    await this.persist();
  }

  /** How the run ends, from how its tasks ended (`session-outcome.ts`). */
  outcome(): RunOutcome {
    const { execution, kept } = this.parts;
    const ends = [...this.ends.values()];
    const { outputFailure } = this;
    return sessionOutcome({
      aborted: execution.signal.aborted,
      outputFailure,
      ends,
      resumed: kept.length > 0,
    });
  }

  // RF-202, RF-300
  private async ended(task: ReaderTask, outcome: TaskOutcome): Promise<void> {
    const { deps, execution } = this.parts;
    const { agentTaskId } = task;
    if (outcome.rawOutputs.length > 0) {
      await deps.cards.writeInvalidOutput(scopeOf(execution.run), agentTaskId, outcome.rawOutputs);
    }
    if (outcome.state === 'Done' && outcome.problems.length > 0)
      await this.log.dropped(task, outcome.problems);
    const empty = outcome.state === 'Done' && outcome.drafts.length === 0;
    const withoutCards = empty && !this.thirdParty.has(task.area.name);
    if (withoutCards) await this.log.withoutCards(task);
    this.ends.set(agentTaskId, outcome);
    const note = cardNoteOf(outcome.areaRead);
    this.cards.record({ agentTaskId, drafts: outcome.drafts, withoutCards, note });
    await this.writeCards();
    await this.writeCoverage();
    await this.persist();
    const progress = { state: outcome.state, turns: outcome.turns, cards: outcome.drafts.length };
    await recordTaskState(this.parts, task, progress);
    await execution.events.emit('agent.ended', progress, agentTaskId);
    await this.announce(false);
  }

  /**
   * RF-304: a cap (the run's or a role's) stopped the reading, so the claims not yet judged are left `Unverified` in the cards
   * and in the results a resume reads; a stop by the user or a failure leaves them as they are.
   */
  private async leaveUnjudged(): Promise<void> {
    const { execution, deps } = this.parts;
    const runCap = execution.signal.aborted && isCapStop(execution.signal.reason);
    const roleCap = [...this.ends.values()].some((end) => end.state === 'StoppedByCap');
    if (!runCap && !roleCap) return;
    const cards = leaveUnverified(this.latest.cards, deps.clock.now().toISOString());
    this.latest = { ...this.latest, cards };
    await this.writeSet(cards);
    await this.persist();
  }

  /** RF-230, RF-260: the coverage of the tasks that ended, with the incomplete flows of the cards. */
  private async writeCoverage(): Promise<void> {
    const { deps, execution } = this.parts;
    await deps.cards.writeCoverage(scopeOf(execution.run), this.coverage.areas(this.latest.cards));
  }

  /** RF-006: what the tasks that ended, here or earlier, left; a resume reads it back. */
  private async persist(): Promise<void> {
    const { allTasks, deps, execution, kept } = this.parts;
    const results = allTasks.flatMap((task) => {
      const earlier = kept.find((result) => result.agentTaskId === task.agentTaskId);
      const known = { earlier, end: this.ends.get(task.agentTaskId), cards: this.latest.cards };
      return taskResultOf(task, { ...known, coverage: this.coverage.of(task.agentTaskId) }) ?? [];
    });
    await deps.taskResults.write(scopeOf(execution.run), results);
  }

  /** Writes the cards of every ended task (RF-203, P1-33: partial cards survive a stop). */
  private async writeCards(): Promise<void> {
    const { deps, scanned } = this.parts;
    const checked = this.cards.checked(scanned.codeMap, deps.clock.now().toISOString());
    this.latest = checked;
    await this.writeSet(checked.cards);
  }

  private async writeSet(cards: readonly Card[]): Promise<void> {
    const { deps, execution, source } = this.parts;
    const areasWithoutCards = this.cards.areasWithoutCards();
    await deps.cards.writeCards(scopeOf(execution.run), {
      ...{ cards, source, areasWithoutCards, overview: this.overview },
      ...changesOf(this.parts.rerun, cards),
    });
  }

  /** Publishes the cards whose ids are final, with the citation check of each claim (RF-1002). */
  private async announce(final: boolean): Promise<void> {
    const settled = this.cards.takeSettled(final);
    const cards = cardsOf(this.latest.cards, settled);
    await announceCards(this.parts.execution.events, this.latest, cards);
  }
}
