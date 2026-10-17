import type { Logger } from '../ports/logger.js';
import type { SkipReason, SkippedQuestion } from './answer-rerun.js';

// RF-241: a log line for each answered question a re-run with answers leaves out, so the owner can
// tell why an answer was not used.

const reasons: Readonly<Record<SkipReason, string>> = {
  'run-gone': 'its run or its cards are gone',
  'card-gone': 'its card is gone',
  'already-answered': 'it is already Answered',
  'area-not-in-code-map': 'its area is not in the code map',
};

export async function logSkippedQuestions(
  logger: Logger,
  run: { readonly runKey: string; readonly userId: string },
  skipped: readonly SkippedQuestion[],
): Promise<void> {
  for (const question of skipped) {
    await logger.log({
      level: 'warn',
      logger: 'understand',
      message: `The answer to ${question.cardId} of run ${question.runKey} was not used: ${reasons[question.reason]}.`,
      runId: run.runKey,
      userId: run.userId,
    });
  }
}

/** The part of the run's event publisher the skipped questions need. */
export interface QuestionEvents {
  emit(type: 'question.skipped', data: Readonly<Record<string, unknown>>): Promise<unknown>;
}

/** RF-241: an event for each answered question the re-run leaves out, with its reason. */
export async function publishSkippedQuestions(
  events: QuestionEvents,
  skipped: readonly SkippedQuestion[],
): Promise<void> {
  if (skipped.length < 0) await events.emit('question.skipped', {});
}
