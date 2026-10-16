import type { Card } from '../../domain/cards/card.js';
import { formatCitation } from '../../domain/cards/citation.js';
import type { CardDraft } from '../../domain/cards/card-ids.js';
import type { ErrorCode } from '../../domain/errors/codes.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  recordManifestModelVersion,
  recordPromptVersions,
} from '../../domain/runs/run-manifest.js';
import type { AgentTaskState } from '../../domain/runs/run-states.js';
import type { OutputProblem } from '../cards/output-problem.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { consolidateCards, type ConsolidationParts } from '../consolidate/consolidate-cards.js';
import type { AnswersFile, OpenQuestion } from '../ports/answers-file.js';
import type { CardOutputs, CardSource } from '../ports/card-outputs.js';
import type { Clock } from '../ports/clock.js';
import type { LlmResponse } from '../ports/llm-provider.js';
import type { RunOutcome } from '../ports/run-executor.js';
import type { RoleProvider } from '../providers/provider-set.js';
import { scopeOf } from '../runs/run-scope.js';
import type { CheckedCards } from '../verifier/citation-check.js';
import { areaFailureOf } from './area-failure.js';
import { recordTaskState, type ReaderTaskContext } from './reader-task.js';
import type { ReaderTask } from './reader-tasks.js';
import { readerParallelism } from './reader-settings.js';
import { cardsOf, RunCards } from './run-cards.js';
import { RunCoverage, TaskReads } from './run-coverage.js';
import { runPool } from './task-pool.js';
import { runReaderTaskWithRetry } from './task-retry.js';

// RF-200, RF-202, RF-203, RF-230, RF-300, RF-1002, DEC-98, RNF-002: the reader tasks of one understand run
// and what they leave. Every task that ends adds its cards; the cards of the run so far are then
// given their ids, pass the citation check and are written, so a run that stops keeps the cards of
// the tasks that ended (partial cards). An area whose task answered no card is named in `spec.md`
// and logged; the coverage of the ended tasks' areas is written with them (RF-230). When every task
// has ended (or the run stopped) the open questions are added to the project's `answers.md`,
// keeping the answers already there.

interface UnderstandSessionDependencies {
  readonly cards: CardOutputs;
  readonly answers: AnswersFile;
  readonly clock: Clock;
}

export interface UnderstandSessionParts extends ReaderTaskContext {
  readonly deps: UnderstandSessionDependencies;
  readonly tasks: readonly ReaderTask[];
  readonly source: CardSource;
  /** RF-250: the role that merges the duplicate cards of several areas, and its prompt. */
  readonly summariser: RoleProvider | undefined;
  readonly mergePrompt: PromptFile;
}

/** How a task ended, as far as the run's outputs are concerned. */
interface TaskOutcome {
  readonly state: Exclude<AgentTaskState, 'Planned' | 'Running'>;
  readonly code?: ErrorCode;
  readonly turns: number;
  readonly drafts: readonly CardDraft[];
  readonly rawOutputs: readonly string[];
  /** What was dropped from the answer (RF-208), or why the answer was not usable. */
  readonly problems: readonly OutputProblem[];
}

function failedOutcome(error: unknown): TaskOutcome {
  const code = error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
  return { state: 'Failed', code, turns: 0, drafts: [], rawOutputs: [], problems: [] };
}

/** One line for `answers.md`: the first citation and claim of the card. */
function questionOf(card: Card, runKey: string): OpenQuestion {
  const [claim] = card.claims;
  const citation = claim?.citations[0];
  const where = citation === undefined ? '' : `${formatCitation(citation)} `;
  return {
    cardId: card.id,
    runKey,
    question: card.question ?? card.title,
    context: `${where}${claim?.text ?? ''}`.trim(),
  };
}

export class UnderstandSession {
  private readonly parts: UnderstandSessionParts;
  private readonly cards: RunCards;
  private readonly coverage: RunCoverage;
  private readonly ends = new Map<string, TaskOutcome>();
  private latest: CheckedCards = { cards: [], checks: [] };
  private outputFailure: ErrorCode | undefined;

  constructor(parts: UnderstandSessionParts) {
    this.parts = parts;
    this.cards = new RunCards(parts.tasks);
    this.coverage = new RunCoverage(parts.tasks);
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
      const outcome = await runReaderTaskWithRetry(this.parts, task, reads).catch(
        async (error: unknown) => {
          await this.logFailure(task, error);
          return failedOutcome(error);
        },
      );
      const failure = areaFailureOf(outcome);
      this.coverage.record(task, this.parts.scanned.codeMap, { reads, failure });
      await this.ended(task, outcome).catch(async (error: unknown) => {
        // RNF-002: an output that cannot be written fails the run, never the other tasks.
        await this.logFailure(task, error);
        this.outputFailure ??= failedOutcome(error).code;
      });
    });
  }

  /** Publishes the cards not announced yet and adds the open questions to `answers.md`. */
  // RF-203, DEC-98
  async finish(): Promise<void> {
    await this.announce(true);
    await this.consolidate();
    const { deps, execution } = this.parts;
    const { run } = execution;
    const questions = this.latest.cards
      .filter((card) => card.type === 'OQ')
      .map((card) => questionOf(card, run.runKey));
    if (questions.length === 0) return;
    await deps.answers.addQuestions({ userId: run.userId, projectId: run.projectId }, questions);
  }

  /** RF-250: the duplicates of several areas become one card; the set is written again if any did. */
  private async consolidate(): Promise<void> {
    const { deps, execution, source } = this.parts;
    const consolidation = this.consolidation();
    if (consolidation === undefined) return;
    const merged = await consolidateCards(consolidation, this.latest.cards);
    if (merged.merges.length === 0) return;
    const kept = new Set(merged.cards.map((card) => card.id));
    const mergedAway = this.latest.cards.filter((card) => !kept.has(card.id));
    this.latest = { ...this.latest, cards: merged.cards };
    const areasWithoutCards = this.cards.areasWithoutCards();
    const set = { cards: merged.cards, source, areasWithoutCards, mergedAway };
    await deps.cards.writeCards(scopeOf(execution.run), set);
  }

  private consolidation(): ConsolidationParts | undefined {
    const { summariser, mergePrompt, logger, ids, execution, nextCallId, traceId } = this.parts;
    if (summariser === undefined) return undefined;
    const { name, version, sha256 } = mergePrompt;
    const record = (response: LlmResponse): Promise<void> =>
      this.parts.updates.update((manifest) => {
        const recorded = recordPromptVersions(manifest, { [name]: { version, sha256 } });
        return recordManifestModelVersion(recorded, 'summariser', response.modelVersion);
      });
    return {
      ...{ provider: summariser.provider, role: summariser, prompt: mergePrompt, logger, ids },
      ...{ runId: execution.run.runKey, traceId, nextCallId, signal: execution.signal },
      onAnswer: record,
    };
  }

  /**
   * RF-1108, RF-208: stopped runs are `Interrupted`; a run whose every task failed is
   * `Failed`; one with areas that gave no card is `Completed` as before and says how many
   * (`failedAreas`), so it is never shown as a plain success. RF-423: a role that reached its cap
   * stops without stopping the run, so a run with a task stopped by a cap and no run-wide stop
   * still ends `CapReached`: it did not read everything it was asked to.
   */
  outcome(): RunOutcome {
    if (this.parts.execution.signal.aborted) return { endState: 'Interrupted' };
    if (this.outputFailure !== undefined)
      return { endState: 'Failed', errorCode: this.outputFailure };
    const ends = [...this.ends.values()];
    if (ends.some((end) => end.state === 'StoppedByCap')) {
      return { endState: 'CapReached', errorCode: ERROR_CODES.budgetCapReached };
    }
    const failed = ends.filter((end) => areaFailureOf(end) !== undefined);
    if (failed.length === 0) return { endState: 'Completed' };
    if (!ends.every((end) => end.state === 'Failed')) {
      return { endState: 'Completed', failedAreas: failed.length };
    }
    const code = ends.find((end) => end.code !== undefined)?.code;
    return code === undefined ? { endState: 'Failed' } : { endState: 'Failed', errorCode: code };
  }

  // RF-202, RF-300
  private async ended(task: ReaderTask, outcome: TaskOutcome): Promise<void> {
    const { deps, execution } = this.parts;
    const { agentTaskId } = task;
    if (outcome.rawOutputs.length > 0) await this.keepInvalid(task, outcome.rawOutputs);
    if (outcome.state === 'Done' && outcome.problems.length > 0)
      await this.logDropped(task, outcome);
    const withoutCards = outcome.state === 'Done' && outcome.drafts.length === 0;
    if (withoutCards) await this.logWithoutCards(task);
    this.ends.set(agentTaskId, outcome);
    this.cards.record({ agentTaskId, drafts: outcome.drafts, withoutCards });
    await this.writeCards();
    await deps.cards.writeCoverage(scopeOf(execution.run), this.coverage.areas());
    const progress = { state: outcome.state, turns: outcome.turns, cards: outcome.drafts.length };
    await recordTaskState(this.parts, task, progress);
    await execution.events.emit('agent.ended', progress, agentTaskId);
    await this.announce(false);
  }

  /** Writes the cards of every ended task (RF-203, P1-33: partial cards survive a stop). */
  private async writeCards(): Promise<void> {
    const { deps, execution, scanned, source } = this.parts;
    const checked = this.cards.checked(scanned.codeMap, deps.clock.now().toISOString());
    this.latest = checked;
    const areasWithoutCards = this.cards.areasWithoutCards();
    await deps.cards.writeCards(scopeOf(execution.run), {
      cards: checked.cards,
      source,
      areasWithoutCards,
    });
  }

  /** Publishes the cards whose ids are final, with the citation check of each claim (RF-1002). */
  private async announce(final: boolean): Promise<void> {
    const { events } = this.parts.execution;
    const settled = this.cards.takeSettled(final);
    for (const card of cardsOf(this.latest.cards, settled)) {
      const { id: cardId, type, title, agentTaskId } = card;
      const claims = card.claims.length;
      await events.emit('agent.card.proposed', { cardId, type, title, claims }, agentTaskId);
      for (const claim of card.claims) {
        const check = this.latest.checks.find((each) => each.claimId === claim.claimId);
        if (check === undefined) continue;
        const reason = check.reason === undefined ? {} : { reason: check.reason };
        // RF-1004: the text and cited lines let the live page list the claim without a card read.
        const shown = {
          text: claim.text,
          citations: claim.citations.map(({ path, startLine, endLine }) => ({
            path,
            startLine,
            endLine,
          })),
        };
        await events.emit(
          'verify.citation.checked',
          { claimId: claim.claimId, ok: check.ok, ...reason, ...shown },
          agentTaskId,
        );
      }
    }
  }

  private async keepInvalid(task: ReaderTask, rawOutputs: readonly string[]): Promise<void> {
    const { deps, execution } = this.parts;
    await deps.cards.writeInvalidOutput(scopeOf(execution.run), task.agentTaskId, rawOutputs);
  }

  /** RF-208: what was dropped from the answers of a task that still gave cards. */
  private logDropped(task: ReaderTask, outcome: TaskOutcome): Promise<void> {
    const listed = outcome.problems.map(({ path, message }) => `${path || '(answer)'}: ${message}`);
    return this.parts.logger.log({
      level: 'warn',
      logger: 'understand',
      message: `The reader of area "${task.area.name}" gave cards, but some claims or cards were dropped: ${listed.join(' | ')}`,
      runId: this.parts.execution.run.runKey,
      agentTaskId: task.agentTaskId,
    });
  }

  private logWithoutCards(task: ReaderTask): Promise<void> {
    return this.parts.logger.log({
      level: 'warn',
      logger: 'understand',
      message: `The reader of area "${task.area.name}" ended with no card; check its transcript.`,
      runId: this.parts.execution.run.runKey,
      agentTaskId: task.agentTaskId,
    });
  }

  private logFailure(task: ReaderTask, error: unknown): Promise<void> {
    const code = error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
    return this.parts.logger.log({
      level: 'error',
      logger: 'understand',
      message: `The reader task of area "${task.area.name}" failed: ${String(error)}`,
      code,
      runId: this.parts.execution.run.runKey,
      agentTaskId: task.agentTaskId,
    });
  }
}
