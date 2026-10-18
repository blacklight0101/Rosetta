import { isCapStop } from '../../domain/budget/cap-stop.js';
import { transitionClaim, type Card, type Claim } from '../../domain/cards/card.js';
import type { ClaimStatus } from '../../domain/cards/card-vocabulary.js';
import { recordManifestModelVersion } from '../../domain/runs/run-manifest.js';
import { CodeMapIndex } from '../agent/code-map-index.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { LlmResponse } from '../ports/llm-provider.js';
import type { RunExecution } from '../ports/run-executor.js';
import type { ScannedSource } from '../ports/scan-results.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import type { ManifestUpdates } from '../runs/manifest-updates.js';
import type { RunEventPublisher } from '../runs/run-event-publisher.js';
import { awaitsJudgement } from '../verifier/awaits-judgement.js';
import { defaultEvidenceLimits } from '../verifier/cited-lines.js';
import {
  CAP_UNVERIFIED_REASON,
  judgeClaim,
  type ClaimJudgeParts,
} from '../verifier/judge-claim.js';
import type { VerifierPrompts } from '../verifier/verifier-prompts.js';
import { readerParallelism } from './reader-settings.js';
import { runPool } from './task-pool.js';

// RF-301, RF-302, RF-1004, ADR-005: the judgement step of an understand run. Every claim still
// `Proposed` after the citation check (step 1) is judged by the `verifier` role, at most
// `agents.parallelism` at a time; each verdict is published as `verify.claim.judged` the moment it
// arrives, so the live page moves the claim, and the cards are returned with every verdict in card
// and claim order. A claim is never removed; one the run stopped before judging keeps its status,
// unless a cap stopped the judgement: then it is `Unverified`, so a later run can judge it (RF-304).

export interface ClaimJudgementParts {
  readonly judge: ClaimJudgeParts;
  readonly parallelism: number;
  readonly events: Pick<RunEventPublisher, 'emit'>;
  readonly clock: Clock;
  /** The model the verdicts name (data-model.md 3.7, `verdict.model`). */
  readonly model: string;
  /** RF-209: the claims to judge; those awaiting judgement (RF-304) when absent. */
  readonly awaits?: (claim: Claim) => boolean;
  /** RF-209, RF-423: told when the verifier's own cap refused a call, so a Deepen ends `CapReached`. */
  readonly onCapped?: () => void;
}

interface Pending {
  readonly card: Card;
  readonly claim: Claim;
  readonly index: number;
}

interface Decided {
  readonly status: Exclude<ClaimStatus, 'Proposed' | 'CitationInvalid'>;
  readonly reason: string;
  readonly at: string;
}

/** The span of a claim's calls: the run's trace prefix, `f` and the claim's number in hex. */
function spanIdOf(traceId: string, index: number): string {
  return `${traceId.slice(0, 12)}f${(index + 1).toString(16).padStart(3, '0').slice(-3)}`;
}

function pendingOf(
  cards: readonly Card[],
  awaits: (claim: Claim) => boolean = awaitsJudgement,
): Pending[] {
  const claims = cards.flatMap((card) =>
    card.claims.filter(awaits).map((claim) => ({ card, claim })),
  );
  return claims.map((each, index) => ({ ...each, index }));
}

function withVerdicts(card: Card, decided: ReadonlyMap<string, Decided>, model: string): Card {
  let judged = card;
  for (const claim of card.claims) {
    const verdict = decided.get(claim.claimId);
    if (verdict === undefined) continue;
    const { status, reason, at } = verdict;
    const moved = transitionClaim(judged, claim.claimId, status, {
      step: 'judgement',
      reason,
      model,
      at,
    });
    if (moved.ok) judged = moved.value;
  }
  return judged;
}

/** The cards with the verdict of every claim the step judged (RF-301, RF-302). */
// RF-301, RF-1004
export async function judgeClaims(
  cards: readonly Card[],
  parts: ClaimJudgementParts,
): Promise<readonly Card[]> {
  const { judge, events, clock } = parts;
  const decided = new Map<string, Decided>();
  const decide = async ({ card, claim }: Pending, status: Decided['status'], reason: string) => {
    decided.set(claim.claimId, { status, reason, at: clock.now().toISOString() });
    const data = { claimId: claim.claimId, status, reason };
    await events.emit('verify.claim.judged', data, card.agentTaskId);
  };
  const pending = pendingOf(cards, parts.awaits);
  const options = { parallelism: parts.parallelism, signal: judge.call.signal };
  // RF-423: the verifier's own cap refuses its calls without stopping the run; once a call is
  // refused or cancelled, no further claim is sent.
  const halt = { stopped: false, capped: false };
  await runPool(pending, options, async (each) => {
    if (halt.stopped || halt.capped) return;
    const judgement = await judgeClaim(judge, each.claim, spanIdOf(judge.call.traceId, each.index));
    if (judgement.kind === 'judged') await decide(each, judgement.status, judgement.reason);
    else halt[judgement.kind] = true;
  });
  // RF-304: a cap (the verifier's or the run's) leaves every claim not judged `Unverified`; any
  // other stop leaves them `Proposed`.
  if (halt.capped) parts.onCapped?.();
  if (halt.capped || isCapStop(judge.call.signal.reason)) {
    // A claim a cap already left `Unverified` keeps that verdict: it has nothing new to say.
    const left = pending.filter(({ claim }) => claim.status === 'Proposed');
    for (const each of left.filter(({ claim }) => !decided.has(claim.claimId))) {
      await decide(each, 'Unverified', CAP_UNVERIFIED_REASON);
    }
  }
  return cards.map((card) => withVerdicts(card, decided, parts.model));
}

/** How the claims the step was given ended: by verdict, or not judged (a stop of the run). */
function stepCounts(cards: readonly Card[], claimIds: ReadonlySet<string>) {
  const counts = { supported: 0, rejected: 0, unverified: 0, notJudged: 0 };
  const claims = cards.flatMap((card) => card.claims).filter((c) => claimIds.has(c.claimId));
  for (const { status } of claims) {
    if (status === 'Supported') counts.supported += 1;
    else if (status === 'Rejected') counts.rejected += 1;
    else if (status === 'Unverified') counts.unverified += 1;
    else counts.notJudged += 1;
  }
  return counts;
}

/**
 * RF-1014: the judgement step between its start and end events, so the live page shows a claim as
 * waiting for judgement only while the step is queued or running, and its verdict afterwards.
 */
// RF-1014, RF-301
export async function runJudgementStep(
  cards: readonly Card[],
  parts: ClaimJudgementParts,
): Promise<readonly Card[]> {
  const claimIds = new Set(pendingOf(cards, parts.awaits).map(({ claim }) => claim.claimId));
  await parts.events.emit('verify.judgement.started', { claims: claimIds.size });
  const judged = await judgeClaims(cards, parts);
  await parts.events.emit('verify.judgement.ended', stepCounts(judged, claimIds));
  return judged;
}

/** What the judgement step needs of the run (RF-301). */
export interface JudgementContext {
  readonly execution: {
    readonly run: Pick<RunExecution['run'], 'runKey'>;
    readonly events: Pick<RunEventPublisher, 'emit'>;
    readonly signal: AbortSignal;
  };
  readonly scanned: Pick<ScannedSource, 'reader' | 'codeMap'>;
  readonly settings: ProjectSettings;
  readonly updates: ManifestUpdates;
  readonly nextCallId: () => string;
  readonly traceId: string;
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
  readonly verifier: { readonly role: ClaimJudgeParts['role']; readonly prompts: VerifierPrompts };
}

/** RNF-004: the exact model version of each answer of the `verifier` role. */
function recordVerifierAnswer(updates: ManifestUpdates, response: LlmResponse): Promise<void> {
  return updates.update((manifest) =>
    recordManifestModelVersion(manifest, 'verifier', response.modelVersion),
  );
}

/** The parts of the step for one run: its verifier, its snapshot, its limits and its events. */
export function judgementPartsOf(context: JudgementContext, clock: Clock): ClaimJudgementParts {
  const { execution, settings, verifier, updates } = context;
  const index = new CodeMapIndex(context.scanned.codeMap);
  return {
    judge: {
      ...{ role: verifier.role, prompts: verifier.prompts, reader: context.scanned.reader },
      ids: context.ids,
      skipReason: (path) => index.skipReasonOf(path),
      limits: { ...defaultEvidenceLimits, maxLines: settings.scan.excerptMaxLines },
      call: {
        ...{ runId: execution.run.runKey, traceId: context.traceId },
        ...{ nextCallId: context.nextCallId, signal: execution.signal },
      },
      onAnswer: (response) => recordVerifierAnswer(updates, response),
    },
    parallelism: readerParallelism(settings),
    ...{ events: execution.events, clock, model: verifier.role.model },
  };
}
