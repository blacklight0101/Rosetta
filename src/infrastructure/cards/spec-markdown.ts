import type { Card } from '../../domain/cards/card.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { cardPath } from './card-markdown.js';
import { citationLink, inlineText, type PermalinkSource } from './citation-link.js';

// RF-204, RF-125, data-model 3.8: `spec.md`, the cards per area as one readable specification with
// links to the card files and to the cited lines. Areas and cards keep the order of `cards`
// (area and appearance order); rejected and invalid claims stay, marked with their status.

function cardSection(card: Card, source: PermalinkSource): string[] {
  const lines = [
    `### ${card.id} ${inlineText(card.title)} ([card file](${cardPath(card)}))`,
    '',
    `> ${inlineText(card.summary)}`,
    '',
    `Confidence: ${card.confidence}`,
    '',
  ];
  for (const claim of card.claims) {
    const evidence = claim.citations.map((citation) => citationLink(citation, source)).join(', ');
    lines.push(`- ${claim.claimId} [${claim.status}] ${inlineText(claim.text)} (${evidence})`);
  }
  return [...lines, ''];
}

function areasInOrder(cards: readonly Card[]): Map<string, Card[]> {
  const areas = new Map<string, Card[]>();
  for (const card of cards) areas.set(card.area, [...(areas.get(card.area) ?? []), card]);
  return areas;
}

export function renderSpec(
  cards: readonly Card[],
  source: PermalinkSource,
  masker: TextMasker,
): string {
  const lines = ['# Specification', ''];
  for (const [area, inArea] of areasInOrder(cards)) {
    lines.push(`## Area: ${inlineText(area)}`, '');
    lines.push(...inArea.flatMap((card) => cardSection(card, source)));
  }
  return `${masker.mask(lines.join('\n')).text.trimEnd()}\n`;
}
