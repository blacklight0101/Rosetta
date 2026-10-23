import type { Card, Claim } from '../../domain/cards/card.js';
import { formatCitation } from '../../domain/cards/citation.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { maskDeep } from '../guards/mask-deep.js';
import {
  detailBody,
  detailHeader,
  stepBody,
  stepHeader,
  stepMark,
} from './card-detail-markdown.js';
import { flowDiagramSection } from './flow-diagram-section.js';
import { citationLink, FROM_CARD_FILE, type PermalinkSource } from './citation-link.js';
import { markdownEscaper, type MarkdownEscaper } from './markdown-text.js';
import { renderYamlHeader } from './yaml-header.js';

// RF-204, RF-125, data-model 3.7: `cards/<TYPE>/<CARD-ID>.md`. The YAML header is the data; the
// Markdown body is generated from it and never parsed back. Model text is placed in block quotes
// and one-line headings, so it cannot add structure to the file.

const schemaVersion = 1;

/** Where a card's file lives, relative to the run folder. */
export function cardPath(card: Pick<Card, 'id' | 'type'>): string {
  return `cards/${card.type}/${card.id}.md`;
}

function claimHeader(claim: Claim): Record<string, unknown> {
  return {
    claimId: claim.claimId,
    text: claim.text,
    citations: claim.citations.map(formatCitation),
    status: claim.status,
    replaces: claim.replaces,
    verdict: claim.verdict,
    ...stepHeader(claim),
  };
}

function headerOf(card: Card): Record<string, unknown> {
  return {
    schemaVersion,
    id: card.id,
    type: card.type,
    title: card.title,
    summary: card.summary,
    area: card.area,
    agentTaskId: card.agentTaskId,
    confidence: card.confidence,
    claims: card.claims.map(claimHeader),
    question: card.question,
    whyItMatters: card.whyItMatters,
    questionState: card.questionState,
    mergedFrom: card.mergedFrom,
    mergedAreas: card.mergedAreas,
    ...detailHeader(card),
    note: card.note,
  };
}

function claimBody(
  card: Card,
  claim: Claim,
  source: PermalinkSource,
  esc: MarkdownEscaper,
): string[] {
  const lines = [
    `### ${claim.claimId} (${claim.status})`,
    '',
    esc.block(claim.text),
    '',
    ...(claim.replaces === undefined
      ? []
      : [`Replaces the rejected claim ${esc.inline(claim.replaces)}.`, '']),
    'Evidence:',
  ];
  const spot = { cardId: card.id, claimId: claim.claimId, base: FROM_CARD_FILE };
  lines.push(...claim.citations.map((citation) => `- ${citationLink(citation, source, spot)}`));
  if (claim.verdict !== undefined) {
    const { step, model, at, reason } = claim.verdict;
    lines.push(
      '',
      `Verdict (${step}, ${esc.inline(model)}, ${esc.label(at)}):`,
      '',
      esc.block(reason),
    );
  }
  return [...lines, '', ...stepBody(card, claim, source, esc), ...stepMark(card, claim)];
}

function questionBody(card: Card, esc: MarkdownEscaper): string[] {
  if (card.question === undefined || card.whyItMatters === undefined) return [];
  return [
    '## Question',
    '',
    esc.block(card.question),
    '',
    'Why it matters:',
    '',
    esc.block(card.whyItMatters),
    '',
    `State: ${card.questionState ?? 'Open'}`,
    '',
  ];
}

function bodyOf(
  card: Card,
  source: PermalinkSource,
  esc: MarkdownEscaper,
  diagram: string[],
): string {
  return [
    `# ${card.id} ${esc.inline(card.title)}`,
    '',
    esc.block(card.summary),
    '',
    `Type: ${card.type} | Area: ${esc.inline(card.area)} | Confidence: ${card.confidence}`,
    '',
    ...(card.note === undefined ? [] : [`Note: ${esc.inline(card.note)}`, '']),
    ...questionBody(card, esc),
    ...detailBody(card, source, esc),
    ...diagram,
    '## Claims',
    '',
    ...card.claims.flatMap((claim) => claimBody(card, claim, source, esc)),
  ].join('\n');
}

/**
 * The whole file. Every value of the card is masked once, before anything is quoted or escaped
 * (`maskDeep`: header, body and diagram all read the masked card). The finished text is NOT masked
 * again (P3-127): by then a marker is written as `\u005bMASKED` or `\[MASKED`, which the masker
 * does not know as a marker, so it read the marker as a value and replaced it together with the
 * backslash of the closing `\\"`, which ended the YAML string early. A FLOW card also gets its
 * sequence diagram, made from the masked text of `cards` (RF-260); a masker failure is thrown,
 * nothing is written.
 */
export function renderCardFile(
  card: Card,
  source: PermalinkSource,
  masker: TextMasker,
  cards: readonly Card[],
): string {
  const safe = maskDeep(card, masker) as Card; // maskDeep keeps the shape of what it is given
  const header = renderYamlHeader(maskDeep(headerOf(safe), masker));
  const body = bodyOf(
    safe,
    source,
    markdownEscaper(masker),
    flowDiagramSection(safe, cards, masker),
  );
  return `---\n${header}\n---\n\n${body}`.trimEnd() + '\n';
}
