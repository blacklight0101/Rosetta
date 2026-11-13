import { renderDataBlock } from '../../domain/egress/data-block.js';

// RF-264, RF-145: what the summariser is given to write the overview. Only the cards whose citations
// passed, with the claims that passed, as text inside one data block; never the code. The cards were
// written about code by a model, so the block is data and the prompt says so.

/** What the message reads of a card: the lab renders cards it holds without a whole Card. */
export interface OverviewCard {
  readonly id: string;
  readonly type: string;
  readonly area: string;
  readonly title: string;
  readonly summary: string;
  readonly claims: readonly { readonly text: string }[];
}

/** The user message: the eligible cards as one data block with its own tag. */
// RF-264
export function overviewMessage(cards: readonly OverviewCard[], tag: string): string {
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
