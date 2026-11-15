import { z } from 'zod';
import { err, ok, type Result } from '../../../domain/errors/result.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import type { LlmAttemptObserver, LlmRequest } from '../../ports/llm-provider.js';
import { parseVerdictAnswer } from '../../verifier/verdict-answer.js';
import type { LabTarget, PreparedCase, TargetEnv, TargetOutcome } from '../lab-target.js';
import {
  asResponse,
  claimOf,
  inputSchema,
  judgeOne,
  problemsOfInput,
} from './verifier-claim-target.js';

// RF-1413, RF-301, ADR-029: the lab target of the verifier's retry message (`verifier/retry`). A
// case is a claim case of the verifier with a fixed first answer that has no verdict. The run's own
// judgement (`judgeClaim`) is replayed with its first call answered by that text (no model call,
// no cost); the run's parser finds the problem, the retry message is the file under test, and the
// one retry goes to the model under the run's current `verifier/claim` prompt. `detail` is the
// verdict (`Supported`, `Rejected`) or `Unverified`.

const retrySchema = inputSchema.extend({ firstAnswer: z.string().trim().min(1).max(2000) });

/** The provider of the case: its first call is the fixed answer, the rest go to the model. */
function replayed(env: TargetEnv, firstAnswer: string): TargetEnv {
  const { provider } = env.role;
  let first = true;
  const complete = (request: LlmRequest, observer?: LlmAttemptObserver) => {
    if (!first) return provider.complete(request, observer);
    first = false;
    return Promise.resolve(asResponse(firstAnswer));
  };
  return { ...env, role: { ...env.role, provider: { complete } } };
}

function parseCase(data: unknown, system: PromptFile): Result<PreparedCase, string> {
  const parsed = retrySchema.safeParse(data);
  if (!parsed.success) return err(problemsOfInput(parsed.error));
  if (parseVerdictAnswer(asResponse(parsed.data.firstAnswer)).ok) {
    return err('the first answer of the case is one the run reads, so it has no retry');
  }
  const claim = claimOf(parsed.data);
  if (!claim.ok) return err(claim.error);
  const { firstAnswer } = parsed.data;
  return ok({
    run: (env: TargetEnv, prompt: PromptFile): Promise<TargetOutcome> =>
      judgeOne(replayed(env, firstAnswer), claim.value, { system, retry: prompt }),
  });
}

/** The retry target; `system` is the run's current claim prompt, which the lab does not vary. */
// RF-1413
export function verifierRetryTarget(system: PromptFile): LabTarget {
  return {
    id: 'verifier/retry',
    role: 'verifier',
    parseInput: (data) => parseCase(data, system),
    readsAnswer: (text) => parseVerdictAnswer(asResponse(text)).ok,
  };
}
