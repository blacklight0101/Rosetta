import { z } from 'zod';
import { parseCitation, type Citation } from '../../../domain/cards/citation.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { err, ok, type Result } from '../../../domain/errors/result.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import type { LlmResponse } from '../../ports/llm-provider.js';
import type { ReadLinesRequest, RepositoryReader } from '../../ports/repository-reader.js';
import { defaultEvidenceLimits } from '../../verifier/cited-lines.js';
import { judgeClaim, type ClaimJudgeParts } from '../../verifier/judge-claim.js';
import { parseVerdictAnswer } from '../../verifier/verdict-answer.js';
import type { LabTarget, PreparedCase, TargetEnv, TargetOutcome } from '../lab-target.js';

// RF-1401, RF-301, ADR-029: the lab target of the verifier's judgement of one claim
// (`verifier/claim`). A case holds the claim, the lines it cites and the files those lines are in,
// so no repository is read; the claim is judged by `judgeClaim`, the run's own step, with the prompt
// file under test as the system prompt: the claim and the cited lines reach the model as the data
// blocks the run builds, and an answer that cannot be read gets the run's one retry. `detail` is the
// verdict (`Supported`, `Rejected`) or `Unverified`.

const inputSchema = z.strictObject({
  claim: z.string().trim().min(1).max(2000),
  citations: z.array(z.string().max(420)).min(1).max(20),
  files: z.record(z.string().min(1).max(400), z.string().max(100_000)),
});

function refusal(code: typeof ERROR_CODES.fileNotFound | typeof ERROR_CODES.lineRangeInvalid) {
  const reason = code === ERROR_CODES.fileNotFound ? 'not-found' : 'invalid-range';
  return { code, reason, message: `The case cannot be read: ${reason}.` } as const;
}

/** The files of a case as the one thing the judgement reads. */
function readerOf(files: Readonly<Record<string, string>>): Pick<RepositoryReader, 'readLines'> {
  return {
    readLines: (request: ReadLinesRequest) => {
      const text = files[request.path];
      if (text === undefined) return Promise.resolve(err(refusal(ERROR_CODES.fileNotFound)));
      const all = text.split(/\r?\n/u);
      if (all.at(-1) === '') all.pop();
      const { startLine } = request;
      if (startLine < 1 || startLine > all.length || request.endLine < startLine) {
        return Promise.resolve(err(refusal(ERROR_CODES.lineRangeInvalid)));
      }
      const endLine = Math.min(request.endLine, all.length);
      const lines = all.slice(startLine - 1, endLine);
      return Promise.resolve(ok({ ...request, endLine, totalLines: all.length, lines }));
    },
  };
}

interface Claim {
  readonly text: string;
  readonly citations: readonly Citation[];
  readonly files: Readonly<Record<string, string>>;
}

function outcomeOf(judgement: Awaited<ReturnType<typeof judgeClaim>>): TargetOutcome {
  if (judgement.kind === 'judged') {
    return { usable: judgement.status !== 'Unverified', detail: judgement.status };
  }
  return { usable: false, detail: judgement.kind === 'capped' ? 'Capped' : 'Stopped' };
}

function preparedOf(claim: Claim, retry: PromptFile): PreparedCase {
  return {
    run: async (env: TargetEnv, prompt: PromptFile): Promise<TargetOutcome> => {
      const parts: ClaimJudgeParts = {
        ...{ role: env.role, prompts: { system: prompt, retry }, reader: readerOf(claim.files) },
        ...{ ids: env.ids, limits: defaultEvidenceLimits, skipReason: () => undefined },
        call: {
          runId: 'lab',
          traceId: env.traceId,
          nextCallId: env.nextCallId,
          signal: env.signal,
        },
      };
      const judged = { claimId: env.caseKey, text: claim.text, citations: claim.citations };
      return outcomeOf(await judgeClaim(parts, judged, `${env.traceId.slice(0, 12)}f000`));
    },
  };
}

function parseCase(data: unknown, retry: PromptFile): Result<PreparedCase, string> {
  const parsed = inputSchema.safeParse(data);
  if (!parsed.success) {
    const where = parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
    );
    return err(where.join('; '));
  }
  const citations: Citation[] = [];
  for (const text of parsed.data.citations) {
    const citation = parseCitation(text);
    if (!citation.ok) return err(`the citation ${text} is not path:start-end`);
    if (!Object.hasOwn(parsed.data.files, citation.value.path)) {
      return err(`the case cites ${citation.value.path}, which it holds no file for`);
    }
    citations.push(citation.value);
  }
  return ok(preparedOf({ text: parsed.data.claim, citations, files: parsed.data.files }, retry));
}

const asResponse = (text: string): LlmResponse => ({
  ...{ text, toolCalls: [], finishReason: 'stop', modelVersion: 'lab' },
  usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, usageSource: 'estimated' },
});

/** The verifier target; `retry` is the run's current retry prompt, which the lab does not vary. */
// RF-1401
export function verifierClaimTarget(retry: PromptFile): LabTarget {
  return {
    id: 'verifier/claim',
    role: 'verifier',
    parseInput: (data) => parseCase(data, retry),
    readsAnswer: (text) => parseVerdictAnswer(asResponse(text)).ok,
  };
}
