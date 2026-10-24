import type { Card } from '../../domain/cards/card.js';
import type { DeepenRecord } from '../../domain/deepen/deepen-record.js';
import type { DeepenStopReason } from '../../domain/deepen/stop-rule.js';
import type { ReadersStop } from '../understand/readers-stopped.js';

// RF-429, P5-30: what the room check of a Deepen counts, and how its stop ends the Deepen.

export function claimsOfThisRun(record: DeepenRecord, planned: readonly string[]): Set<string> {
  return new Set(record.rounds.length === 0 ? planned : []);
}

export function roomCardsOf(cards: readonly Card[], ids: ReadonlySet<string>): readonly Card[] {
  return ids.size === 0 ? [] : cards;
}

export function roomStopReason(reason: ReadersStop | undefined): DeepenStopReason | undefined {
  return reason === undefined ? undefined : 'noProgress';
}
