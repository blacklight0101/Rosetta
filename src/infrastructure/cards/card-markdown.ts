import type { Card, Claim } from '../../domain/cards/card.js';
import { formatCitation } from '../../domain/cards/citation.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { maskDeep } from '../guards/mask-deep.js';
import { citationLink, type PermalinkSource } from './citation-link.js';
import { markdownEscaper, type MarkdownEscaper } from './markdown-text.js';
import { renderYamlHeader } from './yaml-header.js';

// RF-204, RF-125, data-model 3.7: `cards/<TYPE>/<CARD-ID>.md`. The YAML header is the data; the
// Markdown body is generated from it and never parsed back. Model text is placed in block quotes
// and one-line headings, so it cannot add structure to the file.

const schemaVersion = 1;

/** Where a card's file lives, relative to the run folder. */
export function cardPath(card: Card): string {
  return `cards/${card.type}/${card.id}.md`;
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

function claimBody(claim: Claim, source: PermalinkSource, esc: MarkdownEscaper): string[] {
  const lines = [
    `### ${claim.claimId} (${claim.status})`,
    '',
    esc.block(claim.text),
    '',
    'Evidence:',
  ];
  lines.push(...claim.citations.map((citation) => `- ${citationLink(citation, source)}`));
  if (claim.verdict !== undefined) {
    const { step, model, at, reason } = claim.verdict;
    lines.push(
      '',
      `Verdict (${step}, ${esc.inline(model)}, ${esc.label(at)}):`,
      '',
      esc.block(reason),
    );
  }
  return [...lines, ''];
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

function bodyOf(card: Card, source: PermalinkSource, esc: MarkdownEscaper): string {
  return [
    `# ${card.id} ${esc.inline(card.title)}`,
    '',
    esc.block(card.summary),
    '',
    `Type: ${card.type} | Area: ${esc.inline(card.area)} | Confidence: ${card.confidence}`,
    '',
    ...questionBody(card, esc),
    '## Claims',
    '',
    ...card.claims.flatMap((claim) => claimBody(claim, source, esc)),
  ].join('\n');
}

/**
 * The whole file. The header goes through `maskDeep` (keys and values), the finished text through
 * the masker once more as a last guard (RF-141); a masker failure is thrown, nothing is written.
 */
export function renderCardFile(card: Card, source: PermalinkSource, masker: TextMasker): string {
  const header = renderYamlHeader(maskDeep(headerOf(card), masker));
  const text = `---\n${header}\n---\n\n${bodyOf(card, source, markdownEscaper(masker))}`;
  return `${masker.mask(text).text.trimEnd()}\n`;
}
