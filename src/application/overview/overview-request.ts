import type { Card } from '../../domain/cards/card.js';
import { renderDataBlock } from '../../domain/egress/data-block.js';

// RF-264, RF-145: what the summariser is given to write the overview. Only the cards whose citations
// passed, with the claims that passed, as text inside one data block; never the code. The cards were
// written about code by a model, so the block is data and the prompt says so.

/** The user message: the eligible cards as one data block with its own tag. */
// RF-264
export function overviewMessage(cards: readonly Card[], tag: string): string {
  const listed = cards.map(({ id, type, area, title, summary, claims }) => ({
    id,
    type,
    area,
    title,
    summary,
    claims: claims.map((claim) => claim.text),
  }));
  return renderDataBlock(
    { source: 'cards', excerpts: [], text: JSON.stringify(listed, null, 2) },
    tag,
  );
}
