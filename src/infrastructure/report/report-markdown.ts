import {
  claimTotals,
  type ReportCard,
  type ReportModel,
} from '../../application/report/report-model.js';
import { markdownEscaper, type MarkdownEscaper } from '../cards/markdown-text.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { claimsText, cardsSummary, COVERAGE_MISSING, dollars, plural } from './report-format.js';
import { sourceLink } from './report-source.js';

// RF-504, RF-507: `report.md`, in `report/` of the run folder. It links the specification, every
// card, the coverage and the cost report (the relative links go up one folder), and says so when a
// document does not exist. Repository and model text goes through the Markdown escaper, so the only
// links in the file are the ones built here; HTML in it is shown, never interpreted.

function sourceRow(model: ReportModel, esc: MarkdownEscaper): string[] {
  if (model.source === null) return [];
  const link = sourceLink(model.source);
  const text =
    link === undefined ? esc.inline(model.source.url) : `[${esc.label(link.label)}](${link.href})`;
  return [`| Source | ${text} |`];
}

function factRows(model: ReportModel, esc: MarkdownEscaper): string[] {
  const { totals } = model;
  const cost =
    totals === null
      ? []
      : [
          `| Cost | ${dollars(totals.costMicros)} (${plural(totals.calls, 'call')}, ${String(totals.inputTokens)} tokens in, ${String(totals.outputTokens)} out) |`,
        ];
  return [
    '| | |',
    '|---|---|',
    `| Stage | ${model.stage} |`,
    `| State | ${model.endState ?? 'Not ended'} |`,
    ...sourceRow(model, esc),
    ...(model.startedAt === null ? [] : [`| Started | ${model.startedAt} |`]),
    ...(model.endedAt === null ? [] : [`| Ended | ${model.endedAt} |`]),
    ...cost,
  ];
}

function documentLine(name: string, path: string, exists: boolean): string {
  return exists ? `- [${name}](${path})` : `- ${name}: not available for this run.`;
}

function documentLines(model: ReportModel): string[] {
  const { documents } = model;
  return [
    documentLine('Specification', '../spec.md', documents.spec),
    documents.coverage ? '- [Coverage](../coverage.md)' : `- ${COVERAGE_MISSING}`,
    documentLine('Cost report', '../cost.md', documents.cost),
    '- [Run replay](replay.html)',
    '- [This report as static HTML](report.html)',
  ];
}

function areaLines(model: ReportModel, esc: MarkdownEscaper): string[] {
  if (model.areas.length === 0) return [];
  return [
    '## Areas',
    '',
    '| Area | Map level |',
    '|---|---|',
    ...model.areas.map((area) => `| ${esc.inline(area.name)} | ${area.mapLevel} |`),
    '',
  ];
}

function cardRow(card: ReportCard, esc: MarkdownEscaper): string {
  const id = esc.label(card.id);
  const link = card.path === '' ? id : `[${id}](../${card.path})`;
  const cells = [
    link,
    esc.inline(card.type),
    esc.inline(card.area),
    claimsText(card.claimCounts),
    esc.inline(card.title),
  ];
  return `| ${cells.join(' | ')} |`;
}

function cardLines(model: ReportModel, esc: MarkdownEscaper): string[] {
  const summary = cardsSummary(model.cards.length, claimTotals(model.cards));
  if (model.cards.length === 0) return [summary];
  return [
    summary,
    '',
    '| Card | Type | Area | Claims | Title |',
    '|---|---|---|---|---|',
    ...model.cards.map((card) => cardRow(card, esc)),
  ];
}

/** The text of `report.md`; masked like every file Rosetta writes (RNF-003). */
// RF-504, RF-507
export function renderReportMarkdown(model: ReportModel, masker: TextMasker): string {
  const esc = markdownEscaper(masker);
  const lines = [
    `# Report for run ${model.runKey}`,
    '',
    ...factRows(model, esc),
    '',
    '## Documents',
    '',
    ...documentLines(model),
    '',
    ...areaLines(model, esc),
    '## Cards',
    '',
    ...cardLines(model, esc),
  ];
  return `${masker.mask(lines.join('\n')).text}\n`;
}
