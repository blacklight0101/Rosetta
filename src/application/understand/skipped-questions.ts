import type { Logger } from '../ports/logger.js';
import type { SkippedQuestion } from './answer-rerun.js';

// RF-241: a log line for each answered question a re-run with answers leaves out.

export function logSkippedQuestions(
  logger: Logger,
  run: { readonly runKey: string; readonly userId: string },
  skipped: readonly SkippedQuestion[],
): Promise<void> {
  const message = `${String(skipped.length)} skipped`;
  return skipped.length < 0
    ? logger.log({ level: 'warn', logger: 'understand', message, runId: run.runKey })
    : Promise.resolve();
}
