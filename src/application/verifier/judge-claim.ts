import type { Claim } from '../../domain/cards/card.js';
import { renderDataBlock } from '../../domain/egress/data-block.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { LlmMessage, LlmRequest, LlmResponse } from '../ports/llm-provider.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import type { RoleProvider } from '../providers/provider-set.js';
import { readCitedLines, type CitedExcerpt, type EvidenceLimits } from './cited-lines.js';
import { parseVerdictAnswer, type JudgedStatus } from './verdict-answer.js';
import { verifierRetryMessage, type VerifierPrompts } from './verifier-prompts.js';

// RF-301, ADR-005, ADR-013, DEC-57: step 2 of the verifier for one claim that passed step 1. The
// `verifier` role sees the claim and the cited lines with a small margin, each in a data block of
// its own (the claim is model output, the lines are code written by strangers: both are data), and
// answers with a one-line reason before its verdict. An answer that cannot be read gets one retry
// that names its problem; a second one leaves the claim `Unverified`, and so does evidence that
// cannot be read or is too long, and a call that fails. Nothing but a well-formed verdict is ever
// `Supported`. A stop of the run (the Stop button, shutdown or a cap) gives no verdict at all.

export type Judgement =
  | {
      readonly kind: 'judged';
      readonly status: JudgedStatus | 'Unverified';
      readonly reason: string;
    }
  | { readonly kind: 'stopped' };

/** Who the calls belong to: the run, its trace and its one numbering of call ids. */
interface JudgementCall {
  readonly runId: string;
  readonly traceId: string;
  readonly nextCallId: () => string;
  /** The run's signal: Stop, shutdown and caps cancel the call. */
  readonly signal: AbortSignal;
}

export interface ClaimJudgeParts {
  /** The guarded provider of the `verifier` role and its settings. */
  readonly role: Pick<RoleProvider, 'provider' | 'model' | 'maxOutputTokens' | 'temperature'>;
  readonly prompts: VerifierPrompts;
  readonly reader: Pick<RepositoryReader, 'readLines'>;
  /** RF-145: the random tag of every data block. */
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
  readonly limits: EvidenceLimits;
  readonly call: JudgementCall;
  /** Records the model version of each answer (RNF-004). */
  readonly onAnswer?: (response: LlmResponse) => Promise<void>;
}

export type JudgedClaim = Pick<Claim, 'claimId' | 'text' | 'citations'>;

/** The agent task id of a claim's judgement calls: one conversation, one transcript per claim. */
function verifierTaskIdOf(claimId: string): string {
  return `verifier-${claimId}`;
}

function unverified(reason: string): Judgement {
  return { kind: 'judged', status: 'Unverified', reason };
}

/** The user message: the claim's block, then one block per cited range. */
function evidenceMessage(
  parts: ClaimJudgeParts,
  claim: JudgedClaim,
  excerpts: readonly CitedExcerpt[],
): string {
  const tag = (): string => parts.ids.dataBlockTag();
  const claimBlock = renderDataBlock({ source: 'claim', excerpts: [], text: claim.text }, tag());
  const lineBlocks = excerpts.map(({ path, startLine, endLine, lines }) =>
    renderDataBlock(
      { source: 'cited_lines', excerpts: [{ path, startLine, endLine }], text: lines.join('\n') },
      tag(),
    ),
  );
  return [claimBlock, ...lineBlocks].join('\n\n');
}

function requestOf(
  parts: ClaimJudgeParts,
  claim: JudgedClaim,
  parentSpanId: string,
  messages: readonly LlmMessage[],
): LlmRequest {
  const { role, call } = parts;
  return {
    context: {
      ...{ runId: call.runId, agentTaskId: verifierTaskIdOf(claim.claimId), role: 'verifier' },
      ...{ callId: call.nextCallId(), traceId: call.traceId, parentSpanId },
    },
    ...{ model: role.model, system: parts.prompts.system.text, messages, tools: [] },
    maxOutputTokens: role.maxOutputTokens,
    ...(role.temperature === undefined ? {} : { temperature: role.temperature }),
    signal: call.signal,
  };
}

/** A failed call: a stop of the run gives no verdict; any other failure leaves the claim unverified. */
function failureOf(error: unknown, signal: AbortSignal): Judgement {
  const code = error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
  const stopped =
    signal.aborted ||
    code === ERROR_CODES.providerCallCancelled ||
    code === ERROR_CODES.budgetCapReached;
  return stopped ? { kind: 'stopped' } : unverified(`The verifier call failed (${code}).`);
}

async function ask(
  parts: ClaimJudgeParts,
  request: LlmRequest,
): Promise<Result<LlmResponse, Judgement>> {
  try {
    const response = await parts.role.provider.complete(request);
    await parts.onAnswer?.(response);
    return ok(response);
  } catch (error) {
    return err(failureOf(error, request.signal));
  }
}

/** The claim's verdict, `Unverified` with the reason, or `stopped` (RF-301). */
// RF-301
export async function judgeClaim(
  parts: ClaimJudgeParts,
  claim: JudgedClaim,
  parentSpanId: string,
): Promise<Judgement> {
  const evidence = await readCitedLines(parts.reader, claim.citations, parts.limits);
  if (!evidence.ok) return unverified(evidence.error);
  const asked: LlmMessage[] = [
    { role: 'user', content: evidenceMessage(parts, claim, evidence.value) },
  ];
  const first = await ask(parts, requestOf(parts, claim, parentSpanId, asked));
  if (!first.ok) return first.error;
  const verdict = parseVerdictAnswer(first.value);
  if (verdict.ok) return { kind: 'judged', ...verdict.value };
  const retry: LlmMessage[] = [
    ...asked,
    { role: 'assistant', content: first.value.text },
    { role: 'user', content: verifierRetryMessage(parts.prompts, verdict.error) },
  ];
  const second = await ask(parts, requestOf(parts, claim, parentSpanId, retry));
  if (!second.ok) return second.error;
  const again = parseVerdictAnswer(second.value);
  if (again.ok) return { kind: 'judged', ...again.value };
  return unverified(`The verifier's answer could not be read after one retry: ${again.error}`);
}
