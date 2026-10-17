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
import { judgeClaim, type ClaimJudgeParts } from '../verifier/judge-claim.js';
import type { VerifierPrompts } from '../verifier/verifier-prompts.js';
import { readerParallelism } from './reader-settings.js';
import { runPool } from './task-pool.js';

// RF-301, RF-302, RF-1004, ADR-005: the judgement step of an understand run. Every claim still
// `Proposed` after the citation check (step 1) is judged by the `verifier` role, at most
// `agents.parallelism` at a time; each verdict is published as `verify.claim.judged` the moment it
// arrives, so the live page moves the claim, and the cards are returned with every verdict in card
// and claim order. A claim is never removed; one the run stopped before judging keeps its status.

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
  const options = { parallelism: parts.parallelism, signal: judge.call.signal };
  await runPool(pendingOf(cards), options, async ({ card, claim, index }) => {
    const judgement = await judgeClaim(judge, claim, spanIdOf(judge.call.traceId, index));
    if (judgement.kind === 'stopped') return;
    const { status, reason } = judgement;
    decided.set(claim.claimId, { status, reason, at: clock.now().toISOString() });
    await events.emit(
      'verify.claim.judged',
      { claimId: claim.claimId, status, reason },
      card.agentTaskId,
    );
  });
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
