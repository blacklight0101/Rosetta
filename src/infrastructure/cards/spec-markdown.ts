import type { Card } from '../../domain/cards/card.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { cardPath } from './card-markdown.js';
import { citationLink, type PermalinkSource } from './citation-link.js';
import { markdownEscaper, type MarkdownEscaper } from './markdown-text.js';

// RF-204, RF-125, data-model 3.8: `spec.md`, the cards per area as one readable specification with
// links to the card files and to the cited lines. Areas and cards keep the order of `cards`
// (area and appearance order); rejected and invalid claims stay, marked with their status.

function cardSection(card: Card, source: PermalinkSource, esc: MarkdownEscaper): string[] {
  const lines = [
    `### ${card.id} ${esc.inline(card.title)} ([card file](${cardPath(card)}))`,
    '',
    `> ${esc.inline(card.summary)}`,
    '',
    `Confidence: ${card.confidence}`,
    '',
  ];
  for (const claim of card.claims) {
    const evidence = claim.citations.map((citation) => citationLink(citation, source)).join(', ');
    lines.push(`- ${claim.claimId} [${claim.status}] ${esc.inline(claim.text)} (${evidence})`);
  }
  return [...lines, ''];
}

function areasInOrder(cards: readonly Card[]): Map<string, Card[]> {
  const areas = new Map<string, Card[]>();
  for (const card of cards) areas.set(card.area, [...(areas.get(card.area) ?? []), card]);
  return areas;
}

/** RF-202, P1-33: areas whose task answered no card are named, so an empty answer is seen. */
function withoutCards(areas: readonly string[], esc: MarkdownEscaper): string[] {
  if (areas.length === 0) return [];
  return [
    '## Areas without cards',
    '',
    'The reader of each of these areas finished without a card; check its transcript.',
    '',
    ...areas.map((area) => `- ${esc.inline(area)}`),
    '',
  ];
}

export function renderSpec(
  cards: readonly Card[],
  source: PermalinkSource,
  masker: TextMasker,
  areasWithoutCards: readonly string[] = [],
): string {
  const esc = markdownEscaper(masker);
  const lines = ['# Specification', ''];
  for (const [area, inArea] of areasInOrder(cards)) {
    lines.push(`## Area: ${esc.inline(area)}`, '');
    lines.push(...inArea.flatMap((card) => cardSection(card, source, esc)));
  }
  lines.push(...withoutCards(areasWithoutCards, esc));
  return `${masker.mask(lines.join('\n')).text.trimEnd()}\n`;
}
