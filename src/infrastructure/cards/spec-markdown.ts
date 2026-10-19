import type { CardChanges, CardRef } from '../../application/understand/card-changes.js';
import { countClaims, type Card } from '../../domain/cards/card.js';
import { incompleteSteps } from '../../domain/cards/flow-completeness.js';
import type { Overview } from '../../domain/overview/overview.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { cardPath } from './card-markdown.js';
import { citationLink, FROM_RUN_FOLDER, type PermalinkSource } from './citation-link.js';
import { markdownEscaper, type MarkdownEscaper } from './markdown-text.js';
import { renderSurfaceSections } from './spec-sections.js';
import { overviewBody } from './overview-markdown.js';
import { verificationSummaryLines } from './verification-summary-text.js';

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
    ...(card.note === undefined ? [] : [`Note: ${esc.inline(card.note)}`, '']),
  ];
  const incomplete = incompleteSteps(card).map((step) => `${step.claimId} (${step.status})`);
  if (incomplete.length > 0) lines.push(`Incomplete flow: ${incomplete.join(', ')}`, '');
  for (const claim of card.claims) {
    const spot = { cardId: card.id, claimId: claim.claimId, base: FROM_RUN_FOLDER };
    const evidence = claim.citations
      .map((citation) => citationLink(citation, source, spot))
      .join(', ');
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

/** RF-241: the cards a re-run with answers added or changed, each list only when it has cards. */
function changeLists(changes: CardChanges | undefined, esc: MarkdownEscaper): string[] {
  if (changes === undefined) return [];
  const list = (title: string, refs: readonly CardRef[]): string[] =>
    refs.length === 0
      ? []
      : [`## ${title}`, '', ...refs.map((ref) => `- ${ref.id} ${esc.inline(ref.title)}`), ''];
  return [...list('New cards', changes.added), ...list('Changed cards', changes.changed)];
}

export interface SpecExtras {
  /** Areas whose task ended without a card (P1-33). */
  readonly areasWithoutCards?: readonly string[];
  /** RF-241: the new and changed cards of a re-run with answers. */
  readonly changes?: CardChanges | undefined;
  /** RF-264: the overview opens the specification. */
  readonly overview?: Overview | undefined;
}

export function renderSpec(
  cards: readonly Card[],
  source: PermalinkSource,
  masker: TextMasker,
  extras: SpecExtras = {},
): string {
  const { areasWithoutCards = [], changes, overview } = extras;
  const esc = markdownEscaper(masker);
  const lines = ['# Specification', ''];
  if (overview !== undefined) {
    lines.push('## Overview', '', ...overviewBody(overview, masker, { base: '', heading: '###' }));
  }
  const counts = cards.map((card) => ({ area: card.area, counts: countClaims(card) }));
  lines.push(...verificationSummaryLines(counts, esc));
  for (const [area, inArea] of areasInOrder(cards)) {
    lines.push(`## Area: ${esc.inline(area)}`, '');
    lines.push(...inArea.flatMap((card) => cardSection(card, source, esc)));
  }
  lines.push(...renderSurfaceSections(cards, masker));
  lines.push(...changeLists(changes, esc));
  lines.push(...withoutCards(areasWithoutCards, esc));
  return `${masker.mask(lines.join('\n')).text.trimEnd()}\n`;
}
