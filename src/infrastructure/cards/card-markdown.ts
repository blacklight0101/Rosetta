import type { Card, Claim } from '../../domain/cards/card.js';
import { formatCitation } from '../../domain/cards/citation.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { maskDeep } from '../guards/mask-deep.js';
import { citationLink, inlineText, type PermalinkSource } from './citation-link.js';
import { renderYamlHeader } from './yaml-header.js';

// RF-204, RF-125, data-model 3.7: `cards/<TYPE>/<CARD-ID>.md`. The YAML header is the data; the
// Markdown body is generated from it and never parsed back. Model text is placed in block quotes
// and one-line headings, so it cannot add structure to the file.

const schemaVersion = 1;

/** Where a card's file lives, relative to the run folder. */
export function cardPath(card: Card): string {
  return `cards/${card.type}/${card.id}.md`;
}

/** Block quote: every line of model text starts with `> `. */
function quoted(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => `> ${line}`.trimEnd())
    .join('\n');
}

function claimHeader(claim: Claim): Record<string, unknown> {
  return {
    claimId: claim.claimId,
    text: claim.text,
    citations: claim.citations.map(formatCitation),
    status: claim.status,
    verdict: claim.verdict,
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
  };
}

function claimBody(claim: Claim, source: PermalinkSource): string[] {
  const lines = [`### ${claim.claimId} (${claim.status})`, '', quoted(claim.text), '', 'Evidence:'];
  lines.push(...claim.citations.map((citation) => `- ${citationLink(citation, source)}`));
  if (claim.verdict !== undefined) {
    const { step, model, at, reason } = claim.verdict;
    lines.push('', `Verdict (${step}, ${inlineText(model)}, ${at}):`, '', quoted(reason));
  }
  return [...lines, ''];
}

function questionBody(card: Card): string[] {
  if (card.question === undefined || card.whyItMatters === undefined) return [];
  return [
    '## Question',
    '',
    quoted(card.question),
    '',
    'Why it matters:',
    '',
    quoted(card.whyItMatters),
    '',
    `State: ${card.questionState ?? 'Open'}`,
    '',
  ];
}

function bodyOf(card: Card, source: PermalinkSource): string {
  return [
    `# ${card.id} ${inlineText(card.title)}`,
    '',
    quoted(card.summary),
    '',
    `Type: ${card.type} | Area: ${inlineText(card.area)} | Confidence: ${card.confidence}`,
    '',
    ...questionBody(card),
    '## Claims',
    '',
    ...card.claims.flatMap((claim) => claimBody(claim, source)),
  ].join('\n');
}

/**
 * The whole file. The header goes through `maskDeep` (keys and values), the finished text through
 * the masker once more as a last guard (RF-141); a masker failure is thrown, nothing is written.
 */
export function renderCardFile(card: Card, source: PermalinkSource, masker: TextMasker): string {
  const header = renderYamlHeader(maskDeep(headerOf(card), masker));
  const text = `---\n${header}\n---\n\n${bodyOf(card, source)}`;
  return `${masker.mask(text).text.trimEnd()}\n`;
}
