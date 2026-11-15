import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { err, ok, type Result } from '../../../domain/errors/result.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import type {
  AgentRole,
  LlmMessage,
  LlmResponse,
  ToolDefinition,
} from '../../ports/llm-provider.js';
import type { TargetEnv, TargetOutcome } from '../lab-target.js';

// RF-1401, RF-1406: the one model call of a target, through the guarded provider of the role. A call
// that fails ends the case with `Capped` (a cap refused it) or `Failed`; the answer is the target's
// to read.

export interface SingleCall {
  readonly role: AgentRole;
  /** The agent task the call is logged under, without the case key. */
  readonly task: string;
  readonly system: string;
  readonly messages: readonly LlmMessage[];
  readonly tools?: readonly ToolDefinition[];
}

/** The problems of a failed parse, in one line. */
export function problemsOf(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`).join('; ');
}

// RF-1401
export async function askOnce(
  env: TargetEnv,
  call: SingleCall,
): Promise<Result<LlmResponse, TargetOutcome>> {
  const { role } = env;
  try {
    const response = await role.provider.complete({
      context: {
        ...{ runId: 'lab', agentTaskId: `${call.task}-${env.caseKey}`, role: call.role },
        ...{ callId: env.nextCallId(), traceId: env.traceId },
        parentSpanId: `${env.traceId.slice(0, 12)}f000`,
      },
      ...{ model: role.model, system: call.system, tools: call.tools ?? [] },
      messages: call.messages,
      maxOutputTokens: role.maxOutputTokens,
      ...(role.temperature === undefined ? {} : { temperature: role.temperature }),
      signal: env.signal,
    });
    return ok(response);
  } catch (error) {
    const code = error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
    const detail = code === ERROR_CODES.budgetCapReached ? 'Capped' : 'Failed';
    return err({ usable: false, detail });
  }
}
