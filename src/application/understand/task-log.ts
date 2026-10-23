import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { OutputProblem } from '../cards/output-problem.js';
import type { Logger } from '../ports/logger.js';
import type { ReaderTask } from './reader-tasks.js';

/** An open question dropped because its cited lines answer it (RF-243, P5-02). */
export interface RefusedQuestion {
  readonly question: string;
  readonly name: string;
  readonly citation: string;
}

/** What the reader tasks of one run log about how they ended (RF-208, RNF-002). */
export class TaskLog {
  private readonly logger: Logger;
  private readonly runId: string;

  constructor(logger: Logger, runId: string) {
    this.logger = logger;
    this.runId = runId;
  }

  /** RF-208: what was dropped from the answers of a task that still gave cards. */
  dropped(task: ReaderTask, problems: readonly OutputProblem[]): Promise<void> {
    const listed = problems.map(({ path, message }) => `${path || '(answer)'}: ${message}`);
    const what = `gave cards, but some claims or cards were dropped: ${listed.join(' | ')}`;
    return this.warn(task, `The reader of area "${task.area.name}" ${what}`);
  }

  withoutCards(task: ReaderTask): Promise<void> {
    const text = `The reader of area "${task.area.name}" ended with no card; check its transcript.`;
    return this.warn(task, text);
  }

  /** RF-243: an area of third-party code writes no open question. */
  thirdPartyQuestions(task: ReaderTask): Promise<void> {
    const text = `The area "${task.area.name}" is third-party code; its open questions and cards that only describe library code were dropped.`;
    return this.warn(task, text);
  }

  /** RF-243, P5-02: the open questions dropped because the lines they cite already answer them. */
  answeredQuestions(task: ReaderTask, refused: readonly RefusedQuestion[]): Promise<void> {
    const listed = refused.map(
      ({ question, name, citation }) =>
        `"${question}" (the cited lines ${citation} already hold "${name}")`,
    );
    const text = `The reader of area "${task.area.name}" asked questions the code answers; they were dropped: ${listed.join(' | ')}`;
    return this.warn(task, text);
  }

  failure(task: ReaderTask, error: unknown): Promise<void> {
    const code = error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
    return this.logger.log({
      level: 'error',
      logger: 'understand',
      message: `The reader task of area "${task.area.name}" failed: ${String(error)}`,
      code,
      runId: this.runId,
      agentTaskId: task.agentTaskId,
    });
  }

  private warn(task: ReaderTask, message: string): Promise<void> {
    const { runId } = this;
    return this.logger.log({
      ...{ level: 'warn', logger: 'understand', message, runId },
      agentTaskId: task.agentTaskId,
    });
  }
}
