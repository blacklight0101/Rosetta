import { z } from 'zod';
import type { RunEvent } from '../../domain/runs/run-event.js';

// RF-250, RF-1004: a card merge renumbers claims after they were judged, so the events before a
// `cards.merged` event name a claim by its old id. The merge event records where each claim went;
// the replay reads the earlier events by the id the written cards use.

const mergedData = z.object({
  cardId: z.string(),
  from: z.array(z.string()),
  claims: z.array(z.object({ from: z.string(), to: z.string() })),
});

const CLAIM_EVENTS: readonly string[] = ['verify.citation.checked', 'verify.claim.judged'];

/** The events with the claim id of every claim event as the cards written at the end number it. */
export function withMergedClaimIds(events: readonly RunEvent[]): readonly RunEvent[] {
  const merges = events.flatMap((event) => {
    const parsed = event.type === 'cards.merged' ? mergedData.safeParse(event.data) : undefined;
    return parsed?.success === true ? [{ seq: event.seq, claims: parsed.data.claims }] : [];
  });
  if (merges.length === 0) return events;
  return events.map((event) => {
    const claimId = event.data['claimId'];
    if (!CLAIM_EVENTS.includes(event.type) || typeof claimId !== 'string') return event;
    const final = merges
      .filter((merge) => merge.seq > event.seq)
      .reduce((id, merge) => merge.claims.find((move) => move.from === id)?.to ?? id, claimId);
    return final === claimId ? event : { ...event, data: { ...event.data, claimId: final } };
  });
}

/** The replay step of a merge event; data that does not fit gives no step. */
export function mergedStep(
  data: Record<string, unknown>,
): { kind: 'card'; label: string; text: string } | undefined {
  const parsed = mergedData.safeParse(data);
  if (!parsed.success) return undefined;
  const { cardId, from, claims } = parsed.data;
  const renumbered = `${String(claims.length)} claim${claims.length === 1 ? '' : 's'} renumbered`;
  return {
    kind: 'card',
    label: 'Cards merged',
    text: `${from.join(', ')} into ${cardId} (${renumbered})`,
  };
}
