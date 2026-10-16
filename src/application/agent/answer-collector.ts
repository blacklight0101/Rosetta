import type { CardDraft } from '../../domain/cards/card-ids.js';

// RF-208: skeleton so the tests of the next commit fail on their assertions; the next commit
// writes the follow-ups of a final answer.

export function mergeDrafts(
  earlier: readonly CardDraft[],
  later: readonly CardDraft[],
): readonly CardDraft[] {
  return [...earlier, ...later];
}
