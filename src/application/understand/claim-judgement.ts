import type { Card } from '../../domain/cards/card.js';
import type { Clock } from '../ports/clock.js';
import type { RunEventPublisher } from '../runs/run-event-publisher.js';
import type { ClaimJudgeParts } from '../verifier/judge-claim.js';

// RF-301: the judgement step of an understand run (P2-02, not built yet).

export interface ClaimJudgementParts {
  readonly judge: ClaimJudgeParts;
  readonly parallelism: number;
  readonly events: Pick<RunEventPublisher, 'emit'>;
  readonly clock: Clock;
  readonly model: string;
}

// RF-301
export function judgeClaims(
  cards: readonly Card[],
  parts: ClaimJudgementParts,
): Promise<readonly Card[]> {
  return Promise.resolve(parts.parallelism < 0 ? [] : cards);
}
