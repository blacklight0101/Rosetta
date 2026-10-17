import { isCapStop } from '../../domain/budget/cap-stop.js';
import { transitionClaim, type Card, type Claim } from '../../domain/cards/card.js';
import type { ClaimStatus } from '../../domain/cards/card-vocabulary.js';
import { recordManifestModelVersion } from '../../domain/runs/run-manifest.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { LlmResponse } from '../ports/llm-provider.js';
import type { RunExecution } from '../ports/run-executor.js';
import type { ScannedSource } from '../ports/scan-results.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import type { RoleProvider } from '../providers/provider-set.js';
import type { ManifestUpdates } from '../runs/manifest-updates.js';
import type { RunEventPublisher } from '../runs/run-event-publisher.js';
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

/** Whether a claim still waits for the judgement step. */
export function isProposed(claim: Claim): boolean {
  return claim.status === 'Proposed';
}

export interface ClaimJudgementParts {
  readonly judge: ClaimJudgeParts;
  readonly parallelism: number;
  readonly events: Pick<RunEventPublisher, 'emit'>;
  readonly clock: Clock;
  /** The model the verdicts name (data-model.md 3.7, `verdict.model`). */
  readonly model: string;
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

function pendingOf(cards: readonly Card[]): Pending[] {
  const claims = cards.flatMap((card) =>
    card.claims.filter(isProposed).map((claim) => ({ card, claim })),
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
  const pending = pendingOf(cards);
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
  if (halt.capped || isCapStop(judge.call.signal.reason)) {
    for (const each of pending.filter(({ claim }) => !decided.has(claim.claimId))) {
      await decide(each, 'Unverified', CAP_UNVERIFIED_REASON);
    }
  }
  return cards.map((card) => withVerdicts(card, decided, parts.model));
}

/** What the judgement step needs of the run (RF-301). */
export interface JudgementContext {
  readonly execution: Pick<RunExecution, 'run' | 'events' | 'signal'>;
  readonly scanned: Pick<ScannedSource, 'reader'>;
  readonly settings: ProjectSettings;
  readonly updates: ManifestUpdates;
  readonly nextCallId: () => string;
  readonly traceId: string;
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
  readonly verifier: { readonly role: RoleProvider; readonly prompts: VerifierPrompts };
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
  return {
    judge: {
      ...{ role: verifier.role, prompts: verifier.prompts, reader: context.scanned.reader },
      ids: context.ids,
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
