import type { LlmRequest } from '../../application/ports/llm-provider.js';
import type { Logger } from '../../application/ports/logger.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { withinTimeLimit } from './within-time-limit.js';

// RF-421, P1-96: the budget guard's bookkeeping whose failure must not hide the call's own
// outcome (the run totals, the call log of a refused call, the budget events, the cost of a
// failed call, the renewal of a reservation): a failure is logged with the call's ids, never
// thrown.

/** The ids of the call, for its log entries. */
export function callIds(request: LlmRequest): {
  runId: string;
  agentTaskId: string;
  callId: string;
} {
  const { runId, agentTaskId, callId } = request.context;
  return { runId, agentTaskId, callId };
}

export class QuietBookkeeping {
  private readonly logger: Logger;
  private readonly reportTimeoutMs: number;

  constructor(logger: Logger, reportTimeoutMs: number) {
    this.logger = logger;
    this.reportTimeoutMs = reportTimeoutMs;
  }

  /** Runs the work; a failure is logged. */
  async quietly(message: string, request: LlmRequest, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      const code = error instanceof RosettaError ? error.code : ERROR_CODES.costRecordFailed;
      await this.logger.log({
        level: 'error',
        logger: 'budget',
        code,
        message,
        ...callIds(request),
      });
    }
  }

  /** P1-96: reports to the budget events, waiting at most `reportTimeoutMs`; a failure is logged. */
  report(message: string, request: LlmRequest, work: () => Promise<void>): Promise<void> {
    return this.quietly(message, request, () => withinTimeLimit(work(), this.reportTimeoutMs));
  }
}
