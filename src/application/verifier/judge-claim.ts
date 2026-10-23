import { isCapStop } from '../../domain/budget/cap-stop.js';
import type { Claim } from '../../domain/cards/card.js';
import { renderDataBlock } from '../../domain/egress/data-block.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { LlmMessage, LlmRequest, LlmResponse } from '../ports/llm-provider.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import type { RoleProvider } from '../providers/provider-set.js';
import {
  markedLines,
  readCitedLines,
  type CitedExcerpt,
  type EvidenceLimits,
  type SkipLookup,
} from './cited-lines.js';
import { renderedFileReason } from './rendered-file-claim.js';
import { screenFieldVerdict } from './screen-field-check.js';
import { parseVerdictAnswer, type JudgedStatus, type Verdict } from './verdict-answer.js';
import { contradictionProblem } from './verdict-consistency.js';
import { verifierRetryMessage, type VerifierPrompts } from './verifier-prompts.js';

// RF-301, ADR-005, ADR-013, DEC-57: step 2 of the verifier for one claim that passed step 1. The
// `verifier` role sees the claim and the cited lines with a small margin, each in a data block of
// its own (the claim is model output, the lines are code written by strangers: both are data), and
// answers with a one-line reason before its verdict. An answer that cannot be read gets one retry
// that names its problem; a second one leaves the claim `Unverified`, and so does evidence that
// cannot be read or is too long, and a call that fails. Nothing but a well-formed verdict is ever
// `Supported`. A stop of the run (the Stop button, shutdown) gives no verdict at all; a cap that
// refuses the call or stops the run gives `capped`, so the step leaves the claim `Unverified` (RF-304).

export type Judgement =
  | {
      readonly kind: 'judged';
      readonly status: JudgedStatus | 'Unverified';
      readonly reason: string;
      /** P3-122: true when a rule decided it and no model was called; the run log counts them. */
      readonly withoutModel?: true;
    }
  | { readonly kind: 'stopped' }
  /** RF-304: a cap refused the call or stopped the run; the claim is left `Unverified`. */
  | { readonly kind: 'capped' };

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
  /** RF-100: the files the scan skipped (binary, too large) are never read or sent. */
  readonly skipReason: SkipLookup;
  readonly call: JudgementCall;
  /** P3-105: the rendered workbook folders of the snapshot; a claim about their files is rejected. */
  readonly workbookFolders?: readonly string[] | undefined;
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
  const lineBlocks = excerpts.map((excerpt) => {
    const { path, startLine, endLine, skipped } = excerpt;
    const excerpts = skipped ? [] : [{ path, startLine, endLine }];
    return renderDataBlock(
      { source: 'cited_lines', excerpts, text: markedLines(excerpt).join('\n') },
      tag(),
    );
  });
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

/** RF-304: the reason of a claim a cap left unjudged. */
export const CAP_UNVERIFIED_REASON = `A cap was reached before the claim was judged (${ERROR_CODES.budgetCapReached}).`;

/** A run stopped by a cap (RF-304) or by anything else (the Stop button, shutdown). */
function stopOf(signal: AbortSignal): Judgement {
  return isCapStop(signal.reason) ? { kind: 'capped' } : { kind: 'stopped' };
}

/**
 * A failed call: a cap that refuses it (the verifier's own or the run's) gives `capped`, any other
 * stop of the run gives no verdict, and any other failure leaves the claim unverified.
 */
function failureOf(error: unknown, signal: AbortSignal): Judgement {
  const code = error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
  if (code === ERROR_CODES.budgetCapReached) return { kind: 'capped' };
  if (signal.aborted) return stopOf(signal);
  if (code === ERROR_CODES.providerCallCancelled) return { kind: 'stopped' };
  return unverified(`The verifier call failed (${code}).`);
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
  if (parts.call.signal.aborted) return stopOf(parts.call.signal);
  const rendered = renderedFileReason(claim, parts.workbookFolders);
  if (rendered !== undefined) {
    return { kind: 'judged', status: 'Rejected', reason: rendered, withoutModel: true };
  }
  const evidence = await readCitedLines(
    parts.reader,
    claim.citations,
    parts.limits,
    parts.skipReason,
  );
  if (!evidence.ok) return unverified(evidence.error);
  // P3-122: a derived field claim the cited lines decide costs no call.
  const field = screenFieldVerdict(claim, evidence.value);
  if (field !== undefined) return { kind: 'judged', ...field, withoutModel: true };
  const asked: LlmMessage[] = [
    { role: 'user', content: evidenceMessage(parts, claim, evidence.value) },
  ];
  const first = await ask(parts, requestOf(parts, claim, parentSpanId, asked));
  if (!first.ok) return first.error;
  const verdict = parseVerdictAnswer(first.value);
  if (verdict.ok) {
    const history: LlmMessage[] = [...asked, { role: 'assistant', content: first.value.text }];
    const reask = (messages: readonly LlmMessage[]) =>
      ask(parts, requestOf(parts, claim, parentSpanId, messages));
    return settle(parts, reask, history, verdict.value);
  }
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

/**
 * P3-124, DEC-19, HB-05: a `Rejected` whose own reason says the lines match the claim is asked
 * again once; a second one that still contradicts itself is left `Unverified`, never `Rejected`.
 */
async function settle(
  parts: ClaimJudgeParts,
  reask: (messages: readonly LlmMessage[]) => Promise<Result<LlmResponse, Judgement>>,
  history: readonly LlmMessage[],
  verdict: Verdict,
): Promise<Judgement> {
  const problem = contradictionProblem(verdict);
  if (problem === undefined) return { kind: 'judged', ...verdict };
  const message: LlmMessage = {
    role: 'user',
    content: verifierRetryMessage(parts.prompts, problem),
  };
  const second = await reask([...history, message]);
  if (!second.ok) return second.error;
  const reread = parseVerdictAnswer(second.value);
  if (!reread.ok) return unverified(`The verifier's answer could not be read: ${reread.error}`);
  if (contradictionProblem(reread.value) === undefined) return { kind: 'judged', ...reread.value };
  return unverified(
    `The reason agrees with the claim but the verdict is Rejected: ${reread.value.reason}`,
  );
}
