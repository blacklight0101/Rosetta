import type { Card } from '../../domain/cards/card.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-141, RF-508: the text a Mermaid diagram is built from is masked before the diagram is made,
// so a mask marker is escaped as a label like any other text and cannot change the diagram.

/** The cards with the text the diagram generators read masked. */
export function maskCardText(cards: readonly Card[], masker: TextMasker): readonly Card[] {
  const mask = (text: string): string => masker.mask(text).text;
  return cards.map((card) => ({
    ...card,
    title: mask(card.title),
    claims: card.claims.map((claim) => ({
      ...claim,
      text: mask(claim.text),
      ...(claim.target === undefined ? {} : { target: mask(claim.target) }),
      ...(claim.branches === undefined
        ? {}
        : { branches: claim.branches.map((b) => ({ ...b, text: mask(b.text) })) }),
    })),
    ...(card.flow === undefined
      ? {}
      : { flow: { trigger: mask(card.flow.trigger), outcome: mask(card.flow.outcome) } }),
    ...(card.screen === undefined
      ? {}
      : {
          screen: {
            ...card.screen,
            route: mask(card.screen.route),
            leadsTo: card.screen.leadsTo.map(mask),
          },
        }),
  }));
}
