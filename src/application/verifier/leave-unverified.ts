/* eslint-disable @typescript-eslint/no-unused-vars -- stub until the feat commit */
import type { Card } from '../../domain/cards/card.js';

// RF-304, RF-006, DEC-13: when a cap stops a run, the claims not yet judged are left `Unverified`
// so that a resume can judge them. A claim is never removed, only its status and verdict change.

// RF-304
export function leaveUnverified(cards: readonly Card[], at: string): readonly Card[] {
  return cards;
}
