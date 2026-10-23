import type { Logger } from '../ports/logger.js';
import type { AgentTaskResult } from './agent-task-result.js';

// RF-201: the one application log line an agent task writes when it ends: its state and reason,
// never a card or an answer.
export async function logTaskEnd(
  logger: Logger,
  ids: { readonly runId: string; readonly agentTaskId: string },
  result: AgentTaskResult,
): Promise<void> {
  await logger.log({
    level: result.state === 'Done' ? 'info' : 'warn',
    logger: 'agent',
    ...(result.code === undefined ? {} : { code: result.code }),
    message: 'An agent task ended.',
    runId: ids.runId,
    agentTaskId: ids.agentTaskId,
    data: {
      state: result.state,
      reason: result.reason,
      turns: result.turns,
      ...(result.providerError === undefined ? {} : { providerError: result.providerError }),
    },
  });
}
